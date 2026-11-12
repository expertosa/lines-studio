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
    lockHostname: 'old',
    lockBootFile: path.join(dir, 'boot-old.json'),
    lockHeartbeatMs: 40,
    lockPollMs: 20,
  });
  let second;
  try {
    const created = await createJob(first.app, APP_TOKEN);
    assert.equal(created.status, 202);
    second = await createTestApp({
      dataDir: dir,
      lockHostname: 'new',
      lockBootFile: path.join(dir, 'boot-new.json'),
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

test('health is 200 while the new process waits, then the old one keeps the process alive', async () => {
  const dir = tempDir();
  const first = await createTestApp({
    dataDir: dir,
    lockHostname: 'old',
    lockBootFile: path.join(dir, 'boot-old.json'),
    lockHeartbeatMs: 60_000,
    lockHandoffPollMs: 60_000,
  });
  let second;
  try {
    let bound = null;
    const pendingApp = createTestApp({
      dataDir: dir,
      lockHostname: 'new',
      lockBootFile: path.join(dir, 'boot-new.json'),
      lockWaitMs: 8000,
      lockPollMs: 30,
      lockHeartbeatMs: 40,
      onListen(info) {
        bound = info;
      },
    });
    const started = Date.now();
    while (!bound) {
      if (Date.now() - started > 5000) throw new Error('new process did not bind');
      await new Promise((resolve) => setTimeout(resolve, 15));
    }
    const waiting = await fetch(`http://127.0.0.1:${bound.port}/v1/health`);
    const waitingBody = await waiting.json();
    assert.equal(waiting.status, 200);
    assert.equal(waitingBody.ok, true);
    assert.equal(waitingBody.ready, false);
    assert.equal(waitingBody.lock, 'waiting');
    const notReady = await fetch(`http://127.0.0.1:${bound.port}/v1/styles`);
    assert.equal(notReady.status, 503);
    const stillServing = await api(first.app, 'GET', '/v1/health');
    assert.equal(stillServing.status, 200);
    assert.equal(stillServing.json.ready, true);
    await first.app.close();
    second = await pendingApp;
    const ready = await api(second.app, 'GET', '/v1/health');
    assert.equal(ready.status, 200);
    assert.equal(ready.json.ready, true);
    assert.equal(ready.json.lock, 'held');
  } finally {
    if (!second && pendingApp) {
      second = await pendingApp.catch(() => null);
    }
    if (second) await second.close();
    else {
      await first.app.close().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

test('a restarted container does not take the lock back after it handed off', async () => {
  const dir = tempDir();
  const bootOld = path.join(dir, 'boot-old.json');
  const first = await acquireInstanceLock(dir, {
    ...quiet,
    hostname: 'old',
    bootFile: bootOld,
    heartbeatMs: 30,
  });
  const pending = acquireInstanceLock(dir, {
    ...quiet,
    hostname: 'new',
    bootFile: path.join(dir, 'boot-new.json'),
    waitMs: 4000,
    pollMs: 20,
    heartbeatMs: 30,
  });
  first.watch(() => {
    first.release();
  });
  const second = await pending;
  let stopRestart = false;
  let restart;
  try {
    const leader = JSON.parse(fs.readFileSync(second.leaderPath, 'utf8'));
    assert.equal(leader.id, second.id);
    const yielded = JSON.parse(fs.readFileSync(path.join(dir, 'worker.yielded.json'), 'utf8'));
    assert.equal(yielded.bootId, first.bootId);
    restart = acquireInstanceLock(dir, {
      ...quiet,
      hostname: 'old',
      bootFile: bootOld,
      waitMs: 400,
      pollMs: 30,
      shouldStop: () => stopRestart,
      onDefer() {},
    });
    const raced = await Promise.race([
      restart.then(() => 'stole'),
      new Promise((resolve) => setTimeout(() => resolve('idle'), 350)),
    ]);
    assert.equal(raced, 'idle');
    const still = JSON.parse(fs.readFileSync(second.leaderPath, 'utf8'));
    assert.equal(still.id, second.id);
    assert.equal(still.hostname, 'new');
  } finally {
    stopRestart = true;
    second.release();
    if (restart) await restart.then((lock) => lock.release(), () => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the yielded container can lead again after the successor is gone', async () => {
  const dir = tempDir();
  const bootOld = path.join(dir, 'boot-old.json');
  const first = await acquireInstanceLock(dir, {
    ...quiet,
    hostname: 'old',
    bootFile: bootOld,
    heartbeatMs: 20,
  });
  const pending = acquireInstanceLock(dir, {
    ...quiet,
    hostname: 'new',
    bootFile: path.join(dir, 'boot-new.json'),
    waitMs: 4000,
    pollMs: 20,
    heartbeatMs: 20,
  });
  first.watch(() => {
    first.release();
  });
  const second = await pending;
  second.release();
  const resumed = await acquireInstanceLock(dir, {
    ...quiet,
    hostname: 'old',
    bootFile: bootOld,
    waitMs: 2000,
    pollMs: 20,
  });
  try {
    assert.equal(resumed.hostname, 'old');
    assert.equal(resumed.bootId, first.bootId);
    const leader = JSON.parse(fs.readFileSync(resumed.leaderPath, 'utf8'));
    assert.equal(leader.id, resumed.id);
    assert.equal(fs.existsSync(path.join(dir, 'worker.yielded.json')), false);
  } finally {
    resumed.release();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function spawnApi(dir, hostname) {
  const child = spawn(process.execPath, ['src/index.js'], {
    cwd: serviceRoot,
    env: {
      ...process.env,
      LINES_DATA_DIR: dir,
      LINES_PORT: '0',
      LINES_HOST: '127.0.0.1',
      LINES_LOCK_HOSTNAME: hostname,
      LINES_ENABLE_TEMPLATE: '0',
      LINES_ENABLE_BLENDER: '0',
      LINES_ENABLE_UGC: '0',
      LINES_BOOTSTRAP_KEYS: '',
      LINES_BOOTSTRAP_KEYS_FILE: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.on('data', () => {});
  return {
    child,
    text() {
      return stderr;
    },
    events() {
      const parsed = [];
      for (const line of stderr.split('\n')) {
        try {
          parsed.push(JSON.parse(line));
        } catch {
          // Plain text from a crash.
        }
      }
      return parsed;
    },
    waitFor(code, timeout = 8000) {
      const started = Date.now();
      return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
          const found = this.events().find((item) => item.code === code);
          if (found) {
            clearInterval(timer);
            resolve(found);
          } else if (Date.now() - started > timeout || child.exitCode != null) {
            clearInterval(timer);
            reject(new Error(`missing ${code} exit=${child.exitCode}\n${stderr}`));
          }
        }, 20);
      });
    },
  };
}

function stopChild(handle) {
  const child = handle?.child;
  if (!child || child.exitCode != null) return Promise.resolve(child?.exitCode ?? null);
  child.kill('SIGTERM');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(child.exitCode);
    }, 4000);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

test('back-to-back rolling processes stay up and a restart does not steal the lock', async () => {
  const dir = tempDir();
  const tag = path.basename(dir);
  const oldName = `old-${tag}`;
  const newName = `new-${tag}`;
  const newerName = `newer-${tag}`;
  const handles = [];
  try {
    const old = spawnApi(dir, oldName);
    handles.push(old);
    const oldReady = await old.waitFor('listening');
    const oldHealth = await fetch(`http://127.0.0.1:${oldReady.port}/v1/health`);
    assert.equal(oldHealth.status, 200);
    assert.equal((await oldHealth.json()).ready, true);

    const neu = spawnApi(dir, newName);
    handles.push(neu);
    const neuBind = await neu.waitFor('bind');
    const waiting = await fetch(`http://127.0.0.1:${neuBind.port}/v1/health`);
    const waitingBody = await waiting.json();
    assert.equal(waiting.status, 200);
    assert.equal(waitingBody.ready, false);
    assert.equal(waitingBody.lock, 'waiting');
    const neuReady = await neu.waitFor('listening');
    assert.equal(old.child.exitCode, null);
    assert.ok(old.events().some((item) => item.code === 'lock_idle'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(old.child.exitCode, null, old.text());
    const ready = await fetch(`http://127.0.0.1:${neuReady.port}/v1/health`);
    const readyBody = await ready.json();
    assert.equal(ready.status, 200);
    assert.equal(readyBody.ready, true);
    assert.equal(readyBody.lock, 'held');
    let leader = JSON.parse(fs.readFileSync(path.join(dir, 'worker.leader.json'), 'utf8'));
    assert.equal(leader.hostname, newName);

    const restarted = spawnApi(dir, oldName);
    handles.push(restarted);
    const restartedBind = await restarted.waitFor('bind');
    const deferred = await fetch(`http://127.0.0.1:${restartedBind.port}/v1/health`);
    assert.equal(deferred.status, 503);
    assert.equal((await deferred.json()).lock, 'yielded');
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(restarted.child.exitCode, null);
    assert.equal(restarted.events().some((item) => item.code === 'listening'), false);
    leader = JSON.parse(fs.readFileSync(path.join(dir, 'worker.leader.json'), 'utf8'));
    assert.equal(leader.hostname, newName);
    assert.equal((await (await fetch(`http://127.0.0.1:${neuReady.port}/v1/health`)).json()).lock, 'held');

    const oldExit = await stopChild(old);
    assert.equal(oldExit, 0);
    leader = JSON.parse(fs.readFileSync(path.join(dir, 'worker.leader.json'), 'utf8'));
    assert.equal(leader.hostname, newName);

    const newer = spawnApi(dir, newerName);
    handles.push(newer);
    await newer.waitFor('bind');
    const newerReady = await newer.waitFor('listening');
    await new Promise((resolve) => setTimeout(resolve, 200));
    assert.equal(neu.child.exitCode, null, neu.text());
    assert.ok(neu.events().some((item) => item.code === 'lock_idle'));
    const newerHealth = await fetch(`http://127.0.0.1:${newerReady.port}/v1/health`);
    assert.equal(newerHealth.status, 200);
    assert.equal((await newerHealth.json()).ready, true);
    leader = JSON.parse(fs.readFileSync(path.join(dir, 'worker.leader.json'), 'utf8'));
    assert.equal(leader.hostname, newerName);

    const neuRestart = spawnApi(dir, newName);
    handles.push(neuRestart);
    const neuRestartBind = await neuRestart.waitFor('bind');
    const neuDeferred = await fetch(`http://127.0.0.1:${neuRestartBind.port}/v1/health`);
    assert.equal(neuDeferred.status, 503);
    await new Promise((resolve) => setTimeout(resolve, 300));
    leader = JSON.parse(fs.readFileSync(path.join(dir, 'worker.leader.json'), 'utf8'));
    assert.equal(leader.hostname, newerName);
    assert.equal(neu.child.exitCode, null);
    assert.equal(neuRestart.child.exitCode, null);
  } finally {
    for (const handle of handles) await stopChild(handle);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
