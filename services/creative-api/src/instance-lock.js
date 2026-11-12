import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export const LOCK_TTL_MS = 15_000;
export const LOCK_WAIT_MS = 45_000;
export const LOCK_POLL_MS = 200;
export const LOCK_HEARTBEAT_MS = 1000;

const SQLITE_MAGIC = 'SQLite format 3';

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}

function removeIfId(file, id) {
  const current = readJson(file);
  if (!current || current.id === id) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // Already gone.
    }
  }
}

function isBusy(error) {
  return error?.errcode === 5 || error?.errcode === 6 || /database is locked|database is busy/i.test(String(error?.message || ''));
}

function isNotDatabase(error) {
  return error?.errcode === 26 || /not a database/i.test(String(error?.message || ''));
}

function legacyState(lockPath, ttlMs, now) {
  if (!fs.existsSync(lockPath)) return 'missing';
  let header = '';
  const fd = fs.openSync(lockPath, 'r');
  try {
    const buf = Buffer.alloc(16);
    const n = fs.readSync(fd, buf, 0, 16, 0);
    header = buf.subarray(0, n).toString('latin1');
  } finally {
    fs.closeSync(fd);
  }
  if (header.startsWith(SQLITE_MAGIC)) return 'sqlite';
  const age = now() - fs.statSync(lockPath).mtimeMs;
  return age < ttlMs ? 'fresh-legacy' : 'stale-legacy';
}

function retireLegacy(lockPath) {
  const aside = `${lockPath}.legacy`;
  fs.rmSync(aside, { force: true });
  try {
    fs.renameSync(lockPath, aside);
  } catch {
    // Another start already moved it.
  }
}

function hold(lockPath, record) {
  let db;
  try {
    db = new DatabaseSync(lockPath);
    db.exec('PRAGMA busy_timeout = 0');
    db.exec(`
      CREATE TABLE IF NOT EXISTS leader (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        token TEXT NOT NULL,
        hostname TEXT NOT NULL,
        pid INTEGER NOT NULL,
        beat INTEGER NOT NULL
      )
    `);
    db.exec('BEGIN IMMEDIATE');
    db.prepare(`
      INSERT INTO leader (id, token, hostname, pid, beat)
      VALUES (1, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        token = excluded.token,
        hostname = excluded.hostname,
        pid = excluded.pid,
        beat = excluded.beat
    `).run(record.id, record.hostname, record.pid, record.beat);
    return db;
  } catch (error) {
    try {
      db?.close();
    } catch {
      // The original error is the one callers need.
    }
    throw error;
  }
}

/**
 * One writer for the shared data directory.
 * The mutex is a SQLite reserved lock on worker.lock. The kernel drops it when
 * the process dies, including SIGKILL, so a new container is not stuck on PID 1
 * (that pid is alive inside every container). A previous build stored only the
 * pid in this file; that text is ignored once it is older than the TTL.
 * While the lock is busy the waiter writes worker.handoff. The holder closes
 * the database and releases the lock so a rolling update does not overlap writers.
 */
export async function acquireInstanceLock(dir, options = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const pollMs = options.pollMs ?? LOCK_POLL_MS;
  const ttlMs = options.ttlMs ?? LOCK_TTL_MS;
  const heartbeatMs = options.heartbeatMs ?? LOCK_HEARTBEAT_MS;
  const hostname = options.hostname || os.hostname();
  const id = options.id || randomUUID();
  const log = options.log || ((fields) => {
    console.error(JSON.stringify({ level: 'info', time: new Date().toISOString(), ...fields }));
  });
  const lockPath = path.join(dir, 'worker.lock');
  const handoffPath = path.join(dir, 'worker.handoff');
  const leaderPath = path.join(dir, 'worker.leader.json');
  const started = now();
  const maxSpins = Math.max(1, Math.ceil(waitMs / Math.max(pollMs, 1))) + 2;
  let spins = 0;
  let loggedWait = false;
  let db = null;

  while (db == null) {
    const legacy = legacyState(lockPath, ttlMs, now);
    if (legacy === 'stale-legacy') retireLegacy(lockPath);
    if (legacy !== 'fresh-legacy') {
      try {
        db = hold(lockPath, { id, hostname, pid: process.pid, beat: now() });
      } catch (error) {
        if (isNotDatabase(error)) retireLegacy(lockPath);
        else if (!isBusy(error)) throw error;
      }
    }
    if (db) break;
    if (!loggedWait) {
      loggedWait = true;
      log({ code: 'lock_wait', hostname });
    }
    writeJson(handoffPath, { id, hostname, beat: now() });
    spins += 1;
    if (now() - started >= waitMs || spins > maxSpins) {
      removeIfId(handoffPath, id);
      const busy = new Error('api_already_running');
      busy.code = 'api_already_running';
      throw busy;
    }
    await sleep(pollMs);
  }

  fs.rmSync(handoffPath, { force: true });
  fs.rmSync(`${lockPath}.legacy`, { force: true });
  const record = () => ({ id, hostname, pid: process.pid, beat: now() });
  writeJson(leaderPath, record());

  let released = false;
  let timer = null;
  let handoffHandler = null;

  function release() {
    if (released) return;
    released = true;
    if (timer) clearInterval(timer);
    timer = null;
    try {
      db.exec('COMMIT');
    } catch {
      try {
        db.exec('ROLLBACK');
      } catch {
        // The connection is already closed.
      }
    }
    try {
      db.close();
    } catch {
      // The connection is already closed.
    }
    removeIfId(leaderPath, id);
    removeIfId(handoffPath, id);
  }

  function tick() {
    if (released) return;
    const beat = now();
    try {
      writeJson(leaderPath, { id, hostname, pid: process.pid, beat });
    } catch {
      // The directory can disappear during shutdown.
    }
    const handoff = readJson(handoffPath);
    if (!handoff || handoff.id === id) return;
    if (typeof handoff.beat !== 'number' || !Number.isFinite(handoff.beat)) return;
    if (handoff.beat > beat + 1000 || beat - handoff.beat >= ttlMs) return;
    if (timer) clearInterval(timer);
    timer = null;
    log({ code: 'lock_handoff', hostname });
    try {
      if (handoffHandler) handoffHandler();
      else release();
    } catch {
      release();
    }
  }

  return {
    id,
    hostname,
    leaderPath,
    lockPath,
    release,
    watch(handler) {
      handoffHandler = handler;
      if (released || timer) return;
      timer = setInterval(tick, heartbeatMs);
      if (typeof timer.unref === 'function') timer.unref();
      tick();
    },
  };
}
