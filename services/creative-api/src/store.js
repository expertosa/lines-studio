import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { BUILTIN_WORKER_ID } from './constants.js';
import { monthStart, nextMonth } from './limits.js';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;

CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  jobs_per_hour INTEGER NOT NULL,
  video_seconds_per_month INTEGER NOT NULL,
  webhook_secret TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('app', 'worker')),
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  scopes TEXT NOT NULL,
  engines TEXT,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked')),
  created_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  end_user_id TEXT,
  reference TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT,
  script_json TEXT,
  style TEXT NOT NULL,
  format TEXT NOT NULL,
  language TEXT NOT NULL,
  seconds INTEGER NOT NULL,
  voice TEXT NOT NULL,
  subtitles INTEGER NOT NULL DEFAULT 0,
  voiceover INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  callback_url TEXT,
  metadata_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  engine TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  lease_owner TEXT,
  lease_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  heartbeat_at INTEGER,
  deadline_at INTEGER NOT NULL,
  artifact_ttl_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency ON jobs(tenant_id, idempotency_key);
CREATE INDEX IF NOT EXISTS jobs_tenant_created ON jobs(tenant_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jobs_status ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  role TEXT NOT NULL CHECK (role IN ('video', 'thumbnail')),
  mime TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  relative_path TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS artifacts_job_role ON artifacts(job_id, role);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'dead')),
  attempt INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (job_id, event)
);
`;

function mapKey(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    kind: row.kind,
    tokenHash: row.token_hash,
    tokenPrefix: row.token_prefix,
    scopes: JSON.parse(row.scopes),
    engines: row.engines ? JSON.parse(row.engines) : [],
    status: row.status,
    createdAt: Number(row.created_at),
    revokedAt: row.revoked_at == null ? null : Number(row.revoked_at),
  };
}

function mapTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobsPerHour: Number(row.jobs_per_hour),
    videoSecondsPerMonth: Number(row.video_seconds_per_month),
    webhookSecret: row.webhook_secret,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    endUserId: row.end_user_id,
    reference: row.reference,
    title: row.title,
    prompt: row.prompt,
    script: row.script_json ? JSON.parse(row.script_json) : null,
    style: row.style,
    format: row.format,
    language: row.language,
    seconds: Number(row.seconds),
    voice: row.voice,
    subtitles: Number(row.subtitles) === 1,
    voiceover: row.voiceover == null ? true : Number(row.voiceover) === 1,
    imageUrl: row.image_url || null,
    callbackUrl: row.callback_url,
    metadata: JSON.parse(row.metadata_json),
    requestHash: row.request_hash,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    engine: row.engine,
    width: Number(row.width),
    height: Number(row.height),
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    cancelRequested: Boolean(row.cancel_requested),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    leaseOwner: row.lease_owner,
    leaseExpiresAt: row.lease_expires_at == null ? null : Number(row.lease_expires_at),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    heartbeatAt: row.heartbeat_at == null ? null : Number(row.heartbeat_at),
    deadlineAt: Number(row.deadline_at),
    artifactTtlMs: Number(row.artifact_ttl_ms),
  };
}

function mapArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    role: row.role,
    mime: row.mime,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    relativePath: row.relative_path,
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
  };
}

function mapWebhook(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    event: row.event,
    status: row.status,
    attempt: Number(row.attempt),
    nextAttemptAt: Number(row.next_attempt_at),
    lastError: row.last_error,
    callbackUrl: row.callback_url,
    tenantId: row.tenant_id,
  };
}

function ensureJobColumn(db, name, ddl) {
  const present = db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name);
  if (!present.includes(name)) db.exec(`ALTER TABLE jobs ADD COLUMN ${ddl}`);
}

export function openStore(dataDir, { now = () => Date.now() } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, 'creative.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec(SCHEMA);
  const columns = db.prepare('PRAGMA table_info(jobs)').all().map((row) => row.name);
  if (columns.includes('brief_json')) {
    throw new Error('This data directory was created by the creative-jobs API. Use a fresh LINES_DATA_DIR.');
  }
  ensureJobColumn(db, 'subtitles', 'subtitles INTEGER NOT NULL DEFAULT 0');
  ensureJobColumn(db, 'voiceover', 'voiceover INTEGER NOT NULL DEFAULT 1');
  ensureJobColumn(db, 'image_url', 'image_url TEXT');

  const getKeyByHash = db.prepare(`SELECT * FROM api_keys WHERE token_hash = ? AND status = 'active'`);
  const getKeyById = db.prepare('SELECT * FROM api_keys WHERE id = ?');
  const getTenant = db.prepare('SELECT * FROM tenants WHERE id = ?');
  const getJob = db.prepare('SELECT * FROM jobs WHERE id = ?');
  const getOwned = db.prepare('SELECT * FROM jobs WHERE id = ? AND tenant_id = ?');
  const getIdem = db.prepare('SELECT * FROM jobs WHERE tenant_id = ? AND idempotency_key = ?');
  const artifactsFor = db.prepare('SELECT * FROM artifacts WHERE job_id = ? ORDER BY created_at ASC');
  const artifactOwned = db.prepare(`
    SELECT artifacts.* FROM artifacts
    JOIN jobs ON jobs.id = artifacts.job_id
    WHERE artifacts.id = ? AND jobs.id = ? AND jobs.tenant_id = ?
  `);
  const artifactById = db.prepare(`
    SELECT artifacts.*, jobs.tenant_id AS tenant_id, jobs.status AS job_status
    FROM artifacts JOIN jobs ON jobs.id = artifacts.job_id
    WHERE artifacts.id = ? AND artifacts.job_id = ?
  `);

  function tx(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // The original error is the one callers need.
      }
      throw error;
    }
  }

  function isConstraint(error) {
    return error?.errcode === 19 || /UNIQUE/i.test(String(error?.message || ''));
  }

  function enqueue(job, event, at) {
    if (!job?.callbackUrl) return;
    db.prepare(`
      INSERT OR IGNORE INTO webhook_events (
        id, job_id, event, status, attempt, next_attempt_at, last_error, created_at, updated_at
      ) VALUES (?, ?, ?, 'pending', 0, ?, NULL, ?, ?)
    `).run(randomUUID(), job.id, event, at, at, at);
  }

  function publicKey(row) {
    const key = mapKey(row);
    if (!key) return null;
    const { tokenHash, ...rest } = key;
    return rest;
  }

  return {
    now,
    upsertTenant({ id, jobsPerHour, videoSecondsPerMonth, webhookSecret }) {
      const at = now();
      const existing = mapTenant(getTenant.get(id));
      if (!existing) {
        db.prepare(`
          INSERT INTO tenants (id, jobs_per_hour, video_seconds_per_month, webhook_secret, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, jobsPerHour, videoSecondsPerMonth, webhookSecret, at, at);
        return { created: true, tenant: mapTenant(getTenant.get(id)) };
      }
      db.prepare(`
        UPDATE tenants
        SET jobs_per_hour = ?, video_seconds_per_month = ?, webhook_secret = ?, updated_at = ?
        WHERE id = ?
      `).run(
        jobsPerHour ?? existing.jobsPerHour,
        videoSecondsPerMonth ?? existing.videoSecondsPerMonth,
        webhookSecret ?? existing.webhookSecret,
        at,
        id,
      );
      return { created: false, tenant: mapTenant(getTenant.get(id)) };
    },
    getTenant(id) {
      const tenant = mapTenant(getTenant.get(id));
      if (!tenant) return null;
      const { webhookSecret, ...rest } = tenant;
      return rest;
    },
    webhookSecret(tenantId) {
      return mapTenant(getTenant.get(tenantId))?.webhookSecret || null;
    },
    upsertKey({ id, tenantId, kind, tokenHash, tokenPrefix, scopes, engines }) {
      const at = now();
      const existing = getKeyById.get(id);
      if (!existing) {
        db.prepare(`
          INSERT INTO api_keys (
            id, tenant_id, kind, token_hash, token_prefix, scopes, engines, status, created_at, revoked_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL)
        `).run(
          id,
          tenantId || null,
          kind,
          tokenHash,
          tokenPrefix,
          JSON.stringify(scopes),
          engines ? JSON.stringify(engines) : null,
          at,
        );
      } else {
        db.prepare(`
          UPDATE api_keys
          SET tenant_id = ?, kind = ?, token_hash = ?, token_prefix = ?, scopes = ?, engines = ?,
              status = 'active', revoked_at = NULL
          WHERE id = ?
        `).run(
          tenantId || null,
          kind,
          tokenHash,
          tokenPrefix,
          JSON.stringify(scopes),
          engines ? JSON.stringify(engines) : null,
          id,
        );
      }
      return publicKey(getKeyById.get(id));
    },
    revokeKey(id) {
      const at = now();
      const result = db.prepare(`
        UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ? AND status = 'active'
      `).run(at, id);
      return Number(result.changes) === 1;
    },
    listKeys() {
      return db.prepare('SELECT * FROM api_keys ORDER BY created_at ASC').all().map(publicKey);
    },
    setKeyEngines(id, engines) {
      const result = db.prepare(`
        UPDATE api_keys SET engines = ? WHERE id = ? AND kind = 'worker' AND status = 'active'
      `).run(JSON.stringify(engines), id);
      return Number(result.changes) === 1;
    },
    getActiveKeyByHash(tokenHash) {
      return mapKey(getKeyByHash.get(tokenHash));
    },
    createOrReplay(input) {
      return tx(() => {
        const existing = mapJob(getIdem.get(input.tenantId, input.idempotencyKey));
        if (existing) {
          if (existing.requestHash !== input.requestHash) return { conflict: true, job: existing };
          return { replay: true, job: existing };
        }
        const tenant = mapTenant(getTenant.get(input.tenantId));
        if (!tenant) return { unknownTenant: true };
        const at = now();
        const windowStart = at - 60 * 60 * 1000;
        const hourly = db.prepare(
          'SELECT COUNT(*) AS c, MIN(created_at) AS oldest FROM jobs WHERE tenant_id = ? AND created_at >= ?',
        ).get(input.tenantId, windowStart);
        if (Number(hourly.c) >= tenant.jobsPerHour) {
          const oldest = Number(hourly.oldest || at);
          const retryAfter = Math.max(1, Math.ceil((oldest + 60 * 60 * 1000 - at) / 1000));
          return { rateLimited: true, scope: 'hour', retryAfter, limit: tenant.jobsPerHour };
        }
        const start = monthStart(at);
        const end = nextMonth(at);
        const used = db.prepare(`
          SELECT COALESCE(SUM(seconds), 0) AS s FROM jobs
          WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
            AND NOT (status = 'cancelled' AND started_at IS NULL)
        `).get(input.tenantId, start, end);
        if (Number(used.s) + input.seconds > tenant.videoSecondsPerMonth) {
          const retryAfter = Math.max(1, Math.ceil((end - at) / 1000));
          return {
            rateLimited: true,
            scope: 'month',
            retryAfter,
            limit: tenant.videoSecondsPerMonth,
            used: Number(used.s),
          };
        }
        const id = randomUUID();
        try {
          db.prepare(`
            INSERT INTO jobs (
              id, tenant_id, end_user_id, reference, title, prompt, script_json, style, format,
              language, seconds, voice, subtitles, voiceover, image_url, callback_url, metadata_json, request_hash, idempotency_key,
              status, engine, width, height, attempt, max_attempts, cancel_requested,
              error_code, error_message, lease_owner, lease_expires_at, created_at, updated_at,
              started_at, finished_at, heartbeat_at, deadline_at, artifact_ttl_ms
            ) VALUES (
              ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              'queued', ?, ?, ?, 0, ?, 0,
              NULL, NULL, NULL, NULL, ?, ?,
              NULL, NULL, NULL, ?, ?
            )
          `).run(
            id,
            input.tenantId,
            input.endUserId,
            input.reference,
            input.title,
            input.prompt,
            input.script ? JSON.stringify(input.script) : null,
            input.style,
            input.format,
            input.language,
            input.seconds,
            input.voice,
            input.subtitles ? 1 : 0,
            input.voiceover === false ? 0 : 1,
            input.imageUrl || null,
            input.callbackUrl,
            JSON.stringify(input.metadata || {}),
            input.requestHash,
            input.idempotencyKey,
            input.engine,
            input.width,
            input.height,
            input.maxAttempts,
            at,
            at,
            input.deadlineAt,
            input.artifactTtlMs,
          );
        } catch (error) {
          if (!isConstraint(error)) throw error;
          const raced = mapJob(getIdem.get(input.tenantId, input.idempotencyKey));
          if (!raced) throw error;
          if (raced.requestHash !== input.requestHash) return { conflict: true, job: raced };
          return { replay: true, job: raced };
        }
        return { created: true, job: mapJob(getJob.get(id)) };
      });
    },
    getOwned(id, tenantId) {
      return mapJob(getOwned.get(id, tenantId));
    },
    readJob(id) {
      return mapJob(getJob.get(id));
    },
    artifactsFor(jobId) {
      return artifactsFor.all(jobId).map(mapArtifact);
    },
    artifactForOwner(artifactId, jobId, tenantId) {
      return mapArtifact(artifactOwned.get(artifactId, jobId, tenantId));
    },
    artifactById(artifactId, jobId) {
      const row = artifactById.get(artifactId, jobId);
      if (!row) return null;
      return { ...mapArtifact(row), tenantId: row.tenant_id, jobStatus: row.job_status };
    },
    listOwned({ tenantId, status, cursor, limit }) {
      const params = [tenantId];
      let where = 'tenant_id = ?';
      if (status) {
        where += ' AND status = ?';
        params.push(status);
      }
      if (cursor) {
        where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(cursor.createdAt, cursor.createdAt, cursor.id);
      }
      params.push(limit + 1);
      const rows = db.prepare(
        `SELECT * FROM jobs WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT ?`,
      ).all(...params).map(mapJob);
      const hasMore = rows.length > limit;
      return { jobs: hasMore ? rows.slice(0, limit) : rows, hasMore };
    },
    usage({ tenantId, from, to }) {
      const rows = db.prepare(`
        SELECT status, COUNT(*) AS c, COALESCE(SUM(seconds), 0) AS s
        FROM jobs
        WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
        GROUP BY status
      `).all(tenantId, from, to);
      const byStatus = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
      let jobs = 0;
      let videoSeconds = 0;
      for (const row of rows) {
        byStatus[row.status] = Number(row.c);
        jobs += Number(row.c);
        if (row.status !== 'cancelled') videoSeconds += Number(row.s);
      }
      const at = now();
      const hourStart = at - 60 * 60 * 1000;
      const jobsThisHour = Number(db.prepare(
        'SELECT COUNT(*) AS c FROM jobs WHERE tenant_id = ? AND created_at >= ?',
      ).get(tenantId, hourStart).c);
      const videoSecondsThisMonth = Number(db.prepare(`
        SELECT COALESCE(SUM(seconds), 0) AS s FROM jobs
        WHERE tenant_id = ? AND created_at >= ? AND created_at < ?
          AND NOT (status = 'cancelled' AND started_at IS NULL)
      `).get(tenantId, monthStart(at), nextMonth(at)).s);
      const tenant = mapTenant(getTenant.get(tenantId));
      return {
        jobs,
        videoSeconds,
        byStatus,
        quota: {
          jobsPerHour: tenant.jobsPerHour,
          jobsThisHour,
          videoSecondsPerMonth: tenant.videoSecondsPerMonth,
          videoSecondsThisMonth,
        },
      };
    },
    requestCancel(id, tenantId) {
      return tx(() => {
        const job = mapJob(getOwned.get(id, tenantId));
        if (!job) return { notFound: true };
        if (job.status === 'cancelled') return { job };
        if (job.status === 'succeeded' || job.status === 'failed') return { notCancellable: true, job };
        const at = now();
        if (job.status === 'queued') {
          db.prepare(`
            UPDATE jobs
            SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
                finished_at = ?, updated_at = ?, cancel_requested = 1
            WHERE id = ? AND status = 'queued'
          `).run(at, at, id);
          const updated = mapJob(getJob.get(id));
          enqueue(updated, 'job.cancelled', at);
          return { job: updated };
        }
        db.prepare(`
          UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND status = 'running'
        `).run(at, id);
        return { pending: true, job: mapJob(getJob.get(id)) };
      });
    },
    isCancelRequested(id) {
      const row = db.prepare('SELECT cancel_requested AS c FROM jobs WHERE id = ?').get(id);
      return Boolean(row?.c);
    },
    claimNext({ engines, owner, leaseMs, concurrency }) {
      return tx(() => {
        const running = Number(db.prepare(`SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'`).get().c);
        if (running >= concurrency) return { full: true };
        const placeholders = engines.map(() => '?').join(', ');
        const at = now();
        const row = db.prepare(`
          SELECT * FROM jobs
          WHERE status = 'queued' AND cancel_requested = 0 AND deadline_at > ? AND engine IN (${placeholders})
          ORDER BY created_at ASC, id ASC
          LIMIT 1
        `).get(at, ...engines);
        if (!row) return { empty: true };
        const leaseExpiresAt = at + leaseMs;
        const updated = db.prepare(`
          UPDATE jobs
          SET status = 'running', attempt = attempt + 1, lease_owner = ?, lease_expires_at = ?,
              started_at = COALESCE(started_at, ?), heartbeat_at = ?, updated_at = ?
          WHERE id = ? AND status = 'queued'
        `).run(owner, leaseExpiresAt, at, at, at, row.id);
        if (Number(updated.changes) !== 1) return { empty: true };
        return { job: mapJob(getJob.get(row.id)) };
      });
    },
    heartbeat(id, owner, leaseMs) {
      return tx(() => {
        const job = mapJob(getJob.get(id));
        if (!job || job.status !== 'running' || job.leaseOwner !== owner) return { mismatch: true, job };
        const at = now();
        if (job.deadlineAt <= at) return { expired: true, job };
        const leaseExpiresAt = at + leaseMs;
        db.prepare(`
          UPDATE jobs SET heartbeat_at = ?, lease_expires_at = ?, updated_at = ?
          WHERE id = ? AND status = 'running' AND lease_owner = ?
        `).run(at, leaseExpiresAt, at, id, owner);
        return { job: mapJob(getJob.get(id)), leaseExpiresAt };
      });
    },
    insertArtifact(jobId, owner, artifact) {
      return tx(() => {
        const job = mapJob(getJob.get(jobId));
        if (!job || job.status !== 'running' || job.leaseOwner !== owner) return { mismatch: true, job };
        const existing = db.prepare('SELECT id FROM artifacts WHERE job_id = ? AND role = ?').get(jobId, artifact.role);
        if (existing) return { exists: true, job };
        const at = now();
        db.prepare(`
          INSERT INTO artifacts (
            id, job_id, role, mime, byte_size, sha256, width, height, duration_ms, relative_path, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          artifact.id,
          jobId,
          artifact.role,
          artifact.mime,
          artifact.byteSize,
          artifact.sha256,
          artifact.width,
          artifact.height,
          artifact.durationMs,
          artifact.relativePath,
          at + job.artifactTtlMs,
          at,
        );
        db.prepare('UPDATE jobs SET updated_at = ? WHERE id = ?').run(at, jobId);
        return { artifact: mapArtifact(db.prepare('SELECT * FROM artifacts WHERE id = ?').get(artifact.id)) };
      });
    },
    complete(id, owner) {
      return tx(() => {
        const job = mapJob(getJob.get(id));
        if (!job || job.status !== 'running' || job.leaseOwner !== owner) return { mismatch: true, job };
        const at = now();
        if (job.cancelRequested) {
          db.prepare(`
            UPDATE jobs
            SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
                finished_at = ?, updated_at = ?, lease_owner = NULL, lease_expires_at = NULL
            WHERE id = ? AND status = 'running'
          `).run(at, at, id);
          const updated = mapJob(getJob.get(id));
          enqueue(updated, 'job.cancelled', at);
          return { cancelled: true, job: updated };
        }
        const video = db.prepare(`SELECT id FROM artifacts WHERE job_id = ? AND role = 'video'`).get(id);
        if (!video) return { missingVideo: true, job };
        db.prepare(`
          UPDATE jobs
          SET status = 'succeeded', error_code = NULL, error_message = NULL,
              finished_at = ?, updated_at = ?, heartbeat_at = ?, lease_owner = NULL, lease_expires_at = NULL
          WHERE id = ? AND status = 'running' AND cancel_requested = 0
        `).run(at, at, at, id);
        const updated = mapJob(getJob.get(id));
        if (updated.status !== 'succeeded') return { mismatch: true, job: updated };
        enqueue(updated, 'job.succeeded', at);
        return { job: updated };
      });
    },
    fail(id, owner, { code, message, retry }) {
      return tx(() => {
        const job = mapJob(getJob.get(id));
        if (!job || job.status !== 'running' || job.leaseOwner !== owner) return { mismatch: true, job };
        const at = now();
        if (code === 'cancelled' || job.cancelRequested) {
          db.prepare(`
            UPDATE jobs
            SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
                cancel_requested = 1, finished_at = ?, updated_at = ?,
                lease_owner = NULL, lease_expires_at = NULL
            WHERE id = ? AND status = 'running'
          `).run(at, at, id);
          const updated = mapJob(getJob.get(id));
          enqueue(updated, 'job.cancelled', at);
          return { job: updated };
        }
        if (retry && job.attempt < job.maxAttempts && job.deadlineAt > at) {
          db.prepare(`
            UPDATE jobs
            SET status = 'queued', error_code = NULL, error_message = NULL,
                lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
            WHERE id = ? AND status = 'running'
          `).run(at, id);
          return { requeued: true, job: mapJob(getJob.get(id)) };
        }
        db.prepare(`
          UPDATE jobs
          SET status = 'failed', error_code = ?, error_message = ?, finished_at = ?, updated_at = ?,
              lease_owner = NULL, lease_expires_at = NULL
          WHERE id = ? AND status = 'running'
        `).run(code, message, at, at, id);
        const updated = mapJob(getJob.get(id));
        enqueue(updated, 'job.failed', at);
        return { job: updated };
      });
    },
    sweep(at = now()) {
      return tx(() => {
        let cancelled = 0;
        let failed = 0;
        let requeued = 0;
        const queuedCancels = db.prepare(`SELECT id FROM jobs WHERE status = 'queued' AND cancel_requested = 1`).all();
        for (const row of queuedCancels) {
          db.prepare(`
            UPDATE jobs
            SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
                finished_at = ?, updated_at = ?
            WHERE id = ? AND status = 'queued'
          `).run(at, at, row.id);
          enqueue(mapJob(getJob.get(row.id)), 'job.cancelled', at);
          cancelled += 1;
        }
        const overdue = db.prepare(`
          SELECT id FROM jobs WHERE status = 'queued' AND cancel_requested = 0 AND deadline_at <= ?
        `).all(at);
        for (const row of overdue) {
          db.prepare(`
            UPDATE jobs
            SET status = 'failed', error_code = 'deadline_exceeded',
                error_message = 'Job deadline exceeded before it started.',
                finished_at = ?, updated_at = ?
            WHERE id = ? AND status = 'queued'
          `).run(at, at, row.id);
          enqueue(mapJob(getJob.get(row.id)), 'job.failed', at);
          failed += 1;
        }
        const running = db.prepare(`SELECT * FROM jobs WHERE status = 'running'`).all().map(mapJob);
        for (const job of running) {
          const leaseDead = job.leaseExpiresAt != null && job.leaseExpiresAt <= at;
          const deadlineDead = job.deadlineAt <= at;
          if (!leaseDead && !deadlineDead) continue;
          if (job.cancelRequested) {
            db.prepare(`
              UPDATE jobs
              SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
                  finished_at = ?, updated_at = ?, lease_owner = NULL, lease_expires_at = NULL
              WHERE id = ? AND status = 'running'
            `).run(at, at, job.id);
            enqueue(mapJob(getJob.get(job.id)), 'job.cancelled', at);
            cancelled += 1;
            continue;
          }
          if (deadlineDead || job.attempt >= job.maxAttempts) {
            const code = deadlineDead ? 'deadline_exceeded' : 'lease_expired';
            const message = deadlineDead
              ? 'Job deadline exceeded.'
              : 'Worker lease expired.';
            db.prepare(`
              UPDATE jobs
              SET status = 'failed', error_code = ?, error_message = ?, finished_at = ?, updated_at = ?,
                  lease_owner = NULL, lease_expires_at = NULL
              WHERE id = ? AND status = 'running'
            `).run(code, message, at, at, job.id);
            enqueue(mapJob(getJob.get(job.id)), 'job.failed', at);
            failed += 1;
            continue;
          }
          db.prepare(`
            UPDATE jobs
            SET status = 'queued', lease_owner = NULL, lease_expires_at = NULL, heartbeat_at = NULL, updated_at = ?
            WHERE id = ? AND status = 'running'
          `).run(at, job.id);
          requeued += 1;
        }
        return { cancelled, failed, requeued };
      });
    },
    recoverRunning() {
      const at = now();
      db.prepare(`
        UPDATE jobs SET lease_expires_at = ? WHERE status = 'running' AND lease_owner = ?
      `).run(at - 1, BUILTIN_WORKER_ID);
      return this.sweep(at);
    },
    releaseForShutdown(id, owner) {
      return tx(() => {
        const job = mapJob(getJob.get(id));
        if (!job || job.status !== 'running' || job.leaseOwner !== owner) return job;
        const at = now();
        const attempt = Math.max(0, job.attempt - 1);
        db.prepare(`
          UPDATE jobs
          SET status = 'queued', attempt = ?, lease_owner = NULL, lease_expires_at = NULL,
              heartbeat_at = NULL, started_at = NULL, updated_at = ?
          WHERE id = ? AND status = 'running'
        `).run(attempt, at, id);
        return mapJob(getJob.get(id));
      });
    },
    pendingWebhooks(at, limit) {
      return db.prepare(`
        SELECT webhook_events.*, jobs.callback_url, jobs.tenant_id
        FROM webhook_events
        JOIN jobs ON jobs.id = webhook_events.job_id
        WHERE webhook_events.status = 'pending' AND webhook_events.next_attempt_at <= ?
        ORDER BY webhook_events.next_attempt_at ASC
        LIMIT ?
      `).all(at, limit).map(mapWebhook);
    },
    markWebhook(id, { delivered, error, nextAttemptAt, dead }) {
      const at = now();
      if (delivered) {
        db.prepare(`
          UPDATE webhook_events
          SET status = 'delivered', attempt = attempt + 1, last_error = NULL, updated_at = ?
          WHERE id = ? AND status = 'pending'
        `).run(at, id);
        return;
      }
      db.prepare(`
        UPDATE webhook_events
        SET status = ?, attempt = attempt + 1, next_attempt_at = ?, last_error = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(dead ? 'dead' : 'pending', nextAttemptAt, error, at, id);
    },
    expiredArtifacts(at) {
      return db.prepare('SELECT * FROM artifacts WHERE expires_at <= ?').all(at).map(mapArtifact);
    },
    deleteArtifact(id) {
      db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
    },
    referencedPaths() {
      return db.prepare('SELECT relative_path FROM artifacts').all().map((row) => row.relative_path);
    },
    close() {
      db.close();
    },
  };
}
