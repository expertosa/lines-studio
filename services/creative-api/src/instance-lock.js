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
  fs.mkdirSync(path.dirname(file), { recursive: true });
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

function safeHost(hostname) {
  const safe = String(hostname || 'host').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120);
  return safe || 'host';
}

export function bootFileFor(hostname, bootFile) {
  if (bootFile) return bootFile;
  return path.join(os.tmpdir(), 'lines-creative-api-boot', `${safeHost(hostname)}.json`);
}

// One id per container filesystem. A new container gets a new file; a process
// restarted inside the same container reads the id it already wrote.
export function ensureBootId(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const existing = readJson(file);
  if (existing && typeof existing.id === 'string' && existing.id) return existing.id;
  const id = randomUUID();
  writeJson(file, { id, at: Date.now() });
  return id;
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

function freshBeat(beat, current, ttlMs) {
  return typeof beat === 'number' && Number.isFinite(beat) && beat <= current + 1000 && current - beat < ttlMs;
}

function yieldPathFor(dir) {
  return path.join(dir, 'worker.yielded.json');
}

export function bootHasYielded(dir, bootId) {
  const value = readJson(yieldPathFor(dir));
  return Boolean(value && value.bootId === bootId);
}

/**
 * True when some other process has a fresh handoff request or leader record.
 * Used after we have already given the lock away.
 */
export function anotherHolderIsActive(dir, self, options = {}) {
  const now = options.now || Date.now;
  const ttlMs = options.ttlMs ?? LOCK_TTL_MS;
  const current = now();
  const handoff = readJson(path.join(dir, 'worker.handoff'));
  const leader = readJson(path.join(dir, 'worker.leader.json'));
  if (handoff && handoff.id !== self?.id && freshBeat(handoff.beat, current, ttlMs)) return true;
  if (leader && leader.id !== self?.id && freshBeat(leader.beat, current, ttlMs)) return true;
  return false;
}

/**
 * Stay in the caller until the successor has been gone for a full TTL, or stop.
 * One empty observation is not enough: the successor deletes its handoff file
 * a moment before it writes the leader record.
 */
export async function waitForSuccessorExit(dir, self, options = {}) {
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const ttlMs = options.ttlMs ?? LOCK_TTL_MS;
  const pollMs = options.pollMs ?? LOCK_POLL_MS;
  const shouldStop = options.shouldStop || (() => false);
  let quietSince = null;
  while (!shouldStop()) {
    if (anotherHolderIsActive(dir, self, { now, ttlMs })) quietSince = null;
    else if (quietSince == null) quietSince = now();
    else if (now() - quietSince >= ttlMs) return 'resume';
    await sleep(pollMs);
  }
  return 'stop';
}

/**
 * One writer for the shared data directory.
 * The mutex is a SQLite reserved lock on worker.lock. The kernel drops it when
 * the process dies, including SIGKILL, so a new container is not stuck on PID 1
 * (that pid is alive inside every container). A previous build stored only the
 * pid in this file; that text is ignored once it is older than the TTL.
 * While the lock is busy the waiter writes worker.handoff. The holder closes
 * the database and releases the lock. It records worker.yielded.json tied to
 * this container's boot id so a restart policy cannot take the lock back while
 * the successor is still waiting or leading.
 */
export async function acquireInstanceLock(dir, options = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const waitMs = options.waitMs ?? LOCK_WAIT_MS;
  const pollMs = options.pollMs ?? LOCK_POLL_MS;
  const ttlMs = options.ttlMs ?? LOCK_TTL_MS;
  const heartbeatMs = options.heartbeatMs ?? LOCK_HEARTBEAT_MS;
  const handoffEvery = options.handoffPollMs ?? Math.min(heartbeatMs, LOCK_POLL_MS);
  const hostname = options.hostname || os.hostname();
  const id = options.id || randomUUID();
  const bootFile = bootFileFor(hostname, options.bootFile);
  const bootId = options.bootId || ensureBootId(bootFile);
  const log = options.log || ((fields) => {
    console.error(JSON.stringify({ level: 'info', time: new Date().toISOString(), ...fields }));
  });
  const lockPath = path.join(dir, 'worker.lock');
  const handoffPath = path.join(dir, 'worker.handoff');
  const leaderPath = path.join(dir, 'worker.leader.json');
  const yieldPath = yieldPathFor(dir);
  const startedAt = options.startedAt ?? now();
  const graceMs = Math.max(pollMs * 2, 1000);
  const maxSpins = Math.max(1, Math.ceil(waitMs / Math.max(pollMs, 1))) + 2;
  let spins = 0;
  let loggedWait = false;
  let loggedDefer = false;
  let passive = false;
  let passiveQuietSince = null;
  let db = null;

  function foreignFresh(file) {
    const value = readJson(file);
    if (!value || value.id === id || !freshBeat(value.beat, now(), ttlMs)) return null;
    return value;
  }

  function yieldedAlready() {
    const value = readJson(yieldPath);
    return Boolean(value && value.bootId === bootId);
  }

  while (db == null) {
    if (typeof options.shouldStop === 'function' && options.shouldStop()) {
      const stopped = new Error('lock_stopped');
      stopped.code = 'lock_stopped';
      throw stopped;
    }
    const handoff = foreignFresh(handoffPath);
    const leader = foreignFresh(leaderPath);
    // A handoff refreshed at or after this process started belongs to a
    // successor that is already waiting. Do not take a free lock out from
    // under it, and do not overwrite its marker. Once this boot has yielded,
    // stay passive for as long as any successor is in charge, even if a later
    // handoff replaces worker.yielded.json.
    if (handoff && handoff.beat >= startedAt - graceMs) passive = true;
    if (yieldedAlready() && (handoff || leader)) passive = true;
    const successorInCharge = Boolean(handoff || leader);
    if (passive && successorInCharge) {
      passiveQuietSince = null;
      if (!loggedDefer) {
        loggedDefer = true;
        log({ code: 'lock_defer', hostname });
      }
      if (typeof options.onDefer === 'function') options.onDefer();
      await sleep(pollMs);
      continue;
    }
    if (passive) {
      if (passiveQuietSince == null) passiveQuietSince = now();
      if (now() - passiveQuietSince < ttlMs) {
        if (typeof options.onDefer === 'function') options.onDefer();
        await sleep(pollMs);
        continue;
      }
      passive = false;
      passiveQuietSince = null;
    }

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
    if (passive) {
      if (typeof options.onDefer === 'function') options.onDefer();
      await sleep(pollMs);
      continue;
    }
    if (typeof options.onWait === 'function') options.onWait();
    if (!loggedWait) {
      loggedWait = true;
      log({ code: 'lock_wait', hostname });
    }
    writeJson(handoffPath, { id, hostname, beat: now() });
    spins += 1;
    if (now() - startedAt >= waitMs || spins > maxSpins) {
      removeIfId(handoffPath, id);
      const busy = new Error('api_already_running');
      busy.code = 'api_already_running';
      throw busy;
    }
    await sleep(pollMs);
  }

  const yielded = readJson(yieldPath);
  if (yielded && yielded.bootId === bootId) fs.rmSync(yieldPath, { force: true });
  fs.rmSync(handoffPath, { force: true });
  fs.rmSync(`${lockPath}.legacy`, { force: true });
  const record = () => ({ id, hostname, pid: process.pid, beat: now() });
  writeJson(leaderPath, record());

  let released = false;
  let timer = null;
  let handoffHandler = null;
  let lastLeaderWrite = 0;

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

  function markYielded() {
    try {
      writeJson(yieldPath, { bootId, hostname, id, at: now() });
    } catch {
      // Releasing the lock still has to happen.
    }
  }

  function tick() {
    if (released) return;
    const beat = now();
    if (lastLeaderWrite === 0 || beat - lastLeaderWrite >= heartbeatMs) {
      lastLeaderWrite = beat;
      try {
        writeJson(leaderPath, { id, hostname, pid: process.pid, beat });
      } catch {
        // The directory can disappear during shutdown.
      }
    }
    const handoff = readJson(handoffPath);
    if (!handoff || handoff.id === id) return;
    if (!freshBeat(handoff.beat, beat, ttlMs)) return;
    markYielded();
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
    bootId,
    leaderPath,
    lockPath,
    release,
    watch(handler) {
      handoffHandler = handler;
      if (released || timer) return;
      timer = setInterval(tick, Math.max(handoffEvery, 20));
      if (typeof timer.unref === 'function') timer.unref();
      tick();
    },
  };
}
