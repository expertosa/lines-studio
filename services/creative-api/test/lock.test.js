import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { acquireLock } from '../src/app.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lock-'));
const fast = { sleep: async () => {}, waitMs: 0 };

test('a crash left a pid-only lock with our own pid (pid 1 in a container): taken over', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'worker.lock'), String(process.pid));
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(path.join(dir, 'worker.lock'), old, old);
  const release = await acquireLock(dir, fast);
  assert.match(fs.readFileSync(path.join(dir, 'worker.lock'), 'utf8'), /"host"/);
  release();
  assert.equal(fs.existsSync(path.join(dir, 'worker.lock')), false);
});

test('same container restarted: our own pid in our own hostname lock is stale', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'worker.lock'), JSON.stringify({ host: 'c1', pid: 1 }));
  const release = await acquireLock(dir, { ...fast, hostname: 'c1', pid: 1 });
  release();
});

test('a live neighbour container keeps its lock fresh: we wait, then refuse', async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'worker.lock'), JSON.stringify({ host: 'old', pid: 1 }));
  let waited = 0;
  await assert.rejects(
    acquireLock(dir, { hostname: 'new', pid: 1, waitMs: 3000, sleep: async () => { waited += 1; }, now: (() => { let t = Date.now(); return () => (t += 1000); })() }),
    (e) => e.code === 'api_already_running',
  );
  assert.ok(waited >= 1);
});

test('the previous container is gone (lock not touched for staleMs): taken over', async () => {
  const dir = tmp();
  const file = path.join(dir, 'worker.lock');
  fs.writeFileSync(file, JSON.stringify({ host: 'old', pid: 1 }));
  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(file, old, old);
  const release = await acquireLock(dir, { ...fast, hostname: 'new', pid: 1 });
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).host, 'new');
  release();
});
