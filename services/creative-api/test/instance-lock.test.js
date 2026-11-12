import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { acquireInstanceLock } from '../src/instance-lock.js';
import { APP_TOKEN, api, createJob, createTestApp, serviceRoot } from './helpers.js';

const quiet = { log() {} };

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'lines-lock-'));
}

test('a second acquire fails while the lock is held, then succeeds after release', async () => {
  const dir = tempDir();
  const first = await acquireInstanceLock(dir, { ...quiet, hostname: 'container-a' });
  try {
    const leader = JSON.parse(fs.readFileSync(first.leaderPath, 'utf8'));
    assert.equal(leader.hostname, 'container-a');
    assert.equal(leader.id, first.id);
    fs.writeFileSync(first.leaderPath, JSON.stringify({ id: 'other', hostname: 'dead', pid: 1, beat: Date.now() }));
    const error = await acquireInstanceLock(dir, { ...quiet, waitMs: 0 }).then(() => {
      throw new Error('second acquire should fail');
    }, (caught) => caught);
    assert.equal(error.code, 'api_already_running');
  } finally {
    first.release();
  }
  const second = await acquireInstanceLock(dir, { ...quiet, waitMs: 1000, hostname: 'container-b' });
  try {
    const leader = JSON.parse(fs.readFileSync(second.leaderPath, 'utf8'));
    assert.equal(leader.hostname, 'container-b');
    assert.notEqual(leader.id, first.id);
  } finally {
    second.release();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a handoff lets the waiter take the lock after the holder releases it', async () => {
  const dir = tempDir();
  const first = await acquireInstanceLock(dir, { ...quiet, heartbeatMs: 30, hostname: 'old' });
  const pending = acquireInstanceLock(dir, {
    ...quiet,
    waitMs: 3000,
    pollMs: 20,
    heartbeatMs: 30,
    hostname: 'new',
  });
  first.watch(() => {
    first.release();
  });
  const second = await pending;
  try {
    assert.equal(second.hostname, 'new');
    assert.notEqual(second.id, first.id);
    const leader = JSON.parse(fs.readFileSync(second.leaderPath, 'utf8'));
    assert.equal(leader.id, second.id);
  } finally {
    second.release();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a leftover worker.lock containing PID 1 does not block a new holder', async () => {
  const dir = tempDir();
  const lockPath = path.join(dir, 'worker.lock');
  fs.writeFileSync(lockPath, '1\n');
  const past = new Date(Date.now() - 60_000);
  fs.utimesSync(lockPath, past, past);
  const lock = await acquireInstanceLock(dir, { ...quiet, waitMs: 1000, ttlMs: 15_000 });
  try {
    const leader = JSON.parse(fs.readFileSync(lock.leaderPath, 'utf8'));
    assert.equal(leader.id, lock.id);
    assert.equal(leader.pid, process.pid);
    assert.equal(fs.existsSync(`${lockPath}.legacy`), false);
  } finally {
    lock.release();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a fresh legacy pid file is replaced only after the TTL', async () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'worker.lock'), '1\n');
  const started = Date.now();
  const lock = await acquireInstanceLock(dir, { ...quiet, waitMs: 2000, ttlMs: 400, pollMs: 40 });
  try {
    assert.ok(Date.now() - started >= 350);
  } finally {
    lock.release();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SIGKILL releases the lock without waiting for the heartbeat TTL', async () => {
  const dir = tempDir();
  const href = pathToFileURL(path.join(serviceRoot, 'src/instance-lock.js')).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { acquireInstanceLock } from ${JSON.stringify(href)};
    const lock = await acquireInstanceLock(process.env.LOCK_DIR, { log() {}, heartbeatMs: 60000 });
    process.stdout.write('held\\n');
    setInterval(() => {}, 1000);
  `], {
    env: { ...process.env, LOCK_DIR: dir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`child did not hold the lock\n${stderr}`)), 5000);
      child.stdout.on('data', (chunk) => {
        if (String(chunk).includes('held')) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`child exited ${code}\n${stderr}`));
      });
    });
    const blocked = await acquireInstanceLock(dir, { ...quiet, waitMs: 0 }).then(() => null, (error) => error);
    assert.equal(blocked?.code, 'api_already_running');
    child.kill('SIGKILL');
    await new Promise((resolve) => child.once('exit', resolve));
    const started = Date.now();
    const lock = await acquireInstanceLock(dir, { ...quiet, waitMs: 3000, pollMs: 50, ttlMs: 60_000 });
    assert.ok(Date.now() - started < 2500);
    lock.release();
  } finally {
    if (child.exitCode == null) child.kill('SIGKILL');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rolling handoff closes the first API before the second opens the database', async () => {
  const dir = tempDir();
  const first = await createTestApp({
    dataDir: dir,
    lockHeartbeatMs: 40,
    lockPollMs: 20,
  });
  let second;
  try {
    const created = await createJob(first.app, APP_TOKEN);
    assert.equal(created.status, 202);
    second = await createTestApp({
      dataDir: dir,
      lockWaitMs: 8000,
      lockPollMs: 20,
      lockHeartbeatMs: 40,
    });
    const listed = await api(second.app, 'GET', '/v1/jobs', { token: APP_TOKEN });
    assert.equal(listed.status, 200);
    assert.ok(listed.json.jobs.some((job) => job.id === created.json.id));
    await assert.rejects(api(first.app, 'GET', '/v1/health'));
  } finally {
    if (second) await second.close();
    else await first.close();
    await first.app.close();
  }
});
