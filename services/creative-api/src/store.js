import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 3000;

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video', 'ad_creative')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  brief_json TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  provider TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL,
  cancel_requested INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  heartbeat_at INTEGER,
  deadline_at INTEGER NOT NULL,
  timeout_ms INTEGER NOT NULL,
  artifact_ttl_ms INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS jobs_idempotency
  ON jobs(tenant_id, customer_id, idempotency_key);
CREATE INDEX IF NOT EXISTS jobs_owner_created
  ON jobs(tenant_id, customer_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS jobs_status_created
  ON jobs(status, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  classification TEXT NOT NULL CHECK (classification = 'rendered'),
  role TEXT NOT NULL CHECK (role = 'master'),
  mime TEXT NOT NULL CHECK (mime IN ('video/mp4', 'image/png')),
  byte_size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  duration_ms INTEGER,
  luma_stdev REAL NOT NULL,
  relative_path TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS artifacts_job ON artifacts(job_id);
`;

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    customerId: row.customer_id,
    kind: row.kind,
    status: row.status,
    brief: JSON.parse(row.brief_json),
    requestHash: row.request_hash,
    idempotencyKey: row.idempotency_key,
    provider: row.provider,
    attempt: Number(row.attempt),
    maxAttempts: Number(row.max_attempts),
    cancelRequested: Boolean(row.cancel_requested),
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    startedAt: row.started_at == null ? null : Number(row.started_at),
    finishedAt: row.finished_at == null ? null : Number(row.finished_at),
    heartbeatAt: row.heartbeat_at == null ? null : Number(row.heartbeat_at),
    deadlineAt: Number(row.deadline_at),
    timeoutMs: Number(row.timeout_ms),
    artifactTtlMs: Number(row.artifact_ttl_ms),
  };
}

function mapArtifact(row) {
  if (!row) return null;
  return {
    id: row.id,
    jobId: row.job_id,
    classification: row.classification,
    role: row.role,
    mime: row.mime,
    byteSize: Number(row.byte_size),
    sha256: row.sha256,
    width: Number(row.width),
    height: Number(row.height),
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    lumaStdev: Number(row.luma_stdev),
    relativePath: row.relative_path,
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at),
  };
}

export function openStore(dataDir, { now = () => Date.now() } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'creative.sqlite'));
  db.exec(SCHEMA);

  const getById = db.prepare('SELECT * FROM jobs WHERE id = ?');
  const getIdem = db.prepare(
    'SELECT * FROM jobs WHERE tenant_id = ? AND customer_id = ? AND idempotency_key = ?',
  );
  const getOwnedStmt = db.prepare(
    'SELECT * FROM jobs WHERE id = ? AND tenant_id = ? AND customer_id = ?',
  );
  const countWindow = db.prepare(
    'SELECT COUNT(*) AS c FROM jobs WHERE tenant_id = ? AND customer_id = ? AND created_at >= ?',
  );
  const insertJob = db.prepare(`
    INSERT INTO jobs (
      id, tenant_id, customer_id, kind, status, brief_json, request_hash, idempotency_key,
      provider, attempt, max_attempts, cancel_requested, error_code, error_message,
      created_at, updated_at, started_at, finished_at, heartbeat_at, deadline_at,
      timeout_ms, artifact_ttl_ms
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?
    )
  `);
  const artifactsFor = db.prepare('SELECT * FROM artifacts WHERE job_id = ? ORDER BY created_at ASC');
  const artifactOwned = db.prepare(`
    SELECT artifacts.* FROM artifacts
    JOIN jobs ON jobs.id = artifacts.job_id
    WHERE artifacts.id = ? AND jobs.id = ? AND jobs.tenant_id = ? AND jobs.customer_id = ?
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

  return {
    now,
    createOrReplay(input, limitPerHour) {
      return tx(() => {
        const existing = mapJob(getIdem.get(input.tenantId, input.customerId, input.idempotencyKey));
        if (existing) {
          if (existing.requestHash !== input.requestHash) return { conflict: true, job: existing };
          return { replay: true, job: existing };
        }
        const windowStart = now() - 60 * 60 * 1000;
        const count = Number(countWindow.get(input.tenantId, input.customerId, windowStart).c);
        if (count >= limitPerHour) return { rateLimited: true, limit: limitPerHour };
        const createdAt = now();
        const id = randomUUID();
        try {
          insertJob.run(
            id,
            input.tenantId,
            input.customerId,
            input.brief.kind,
            'queued',
            JSON.stringify(input.brief),
            input.requestHash,
            input.idempotencyKey,
            input.provider,
            0,
            input.maxAttempts,
            0,
            null,
            null,
            createdAt,
            createdAt,
            null,
            null,
            null,
            input.deadlineAt,
            input.timeoutMs,
            input.artifactTtlMs,
          );
        } catch (error) {
          if (!isConstraint(error)) throw error;
          const raced = mapJob(getIdem.get(input.tenantId, input.customerId, input.idempotencyKey));
          if (!raced) throw error;
          if (raced.requestHash !== input.requestHash) return { conflict: true, job: raced };
          return { replay: true, job: raced };
        }
        return { created: true, job: mapJob(getById.get(id)) };
      });
    },
    getOwned(id, tenantId, customerId) {
      return mapJob(getOwnedStmt.get(id, tenantId, customerId));
    },
    readJob(id) {
      return mapJob(getById.get(id));
    },
    artifactsFor(jobId) {
      return artifactsFor.all(jobId).map(mapArtifact);
    },
    artifactForOwner(artifactId, jobId, tenantId, customerId) {
      return mapArtifact(artifactOwned.get(artifactId, jobId, tenantId, customerId));
    },
    listOwned({ tenantId, customerId, status, cursor, limit }) {
      const params = [tenantId, customerId];
      let where = 'tenant_id = ? AND customer_id = ?';
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
    countRunning() {
      return Number(db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'").get().c);
    },
    expireQueued(at) {
      return tx(() => {
        const cancelled = db.prepare(`
          UPDATE jobs
          SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
              finished_at = ?, updated_at = ?
          WHERE status = 'queued' AND cancel_requested = 1
        `).run(at, at);
        const expired = db.prepare(`
          UPDATE jobs
          SET status = 'failed', error_code = 'deadline_exceeded',
              error_message = 'Job deadline exceeded before render.',
              finished_at = ?, updated_at = ?
          WHERE status = 'queued' AND cancel_requested = 0 AND deadline_at <= ?
        `).run(at, at, at);
        return { cancelled: Number(cancelled.changes), expired: Number(expired.changes) };
      });
    },
    claimNext({ globalLimit, perTenantLimit }) {
      return tx(() => {
        const running = Number(db.prepare("SELECT COUNT(*) AS c FROM jobs WHERE status = 'running'").get().c);
        if (running >= globalLimit) return null;
        const row = db.prepare(`
          SELECT * FROM jobs AS queued
          WHERE queued.status = 'queued'
            AND queued.cancel_requested = 0
            AND queued.deadline_at > ?
            AND (
              SELECT COUNT(*) FROM jobs AS active
              WHERE active.status = 'running' AND active.tenant_id = queued.tenant_id
            ) < ?
          ORDER BY queued.created_at ASC, queued.id ASC
          LIMIT 1
        `).get(now(), perTenantLimit);
        if (!row) return null;
        const at = now();
        const updated = db.prepare(`
          UPDATE jobs
          SET status = 'running', attempt = attempt + 1, started_at = ?, heartbeat_at = ?, updated_at = ?
          WHERE id = ? AND status = 'queued'
        `).run(at, at, at, row.id);
        if (Number(updated.changes) !== 1) return null;
        return mapJob(getById.get(row.id));
      });
    },
    heartbeat(id, at) {
      db.prepare(`
        UPDATE jobs SET heartbeat_at = ?, updated_at = ? WHERE id = ? AND status = 'running'
      `).run(at, at, id);
    },
    isCancelRequested(id) {
      const row = db.prepare('SELECT cancel_requested AS c FROM jobs WHERE id = ?').get(id);
      return Boolean(row?.c);
    },
    requestCancel(id, tenantId, customerId, at) {
      return tx(() => {
        const job = mapJob(getOwnedStmt.get(id, tenantId, customerId));
        if (!job) return { notFound: true };
        if (job.status === 'cancelled') return { job };
        if (job.status === 'succeeded' || job.status === 'failed') return { notCancellable: true, job };
        if (job.status === 'queued') {
          db.prepare(`
            UPDATE jobs
            SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
                finished_at = ?, updated_at = ?, cancel_requested = 1
            WHERE id = ? AND status = 'queued'
          `).run(at, at, id);
          return { job: mapJob(getById.get(id)) };
        }
        db.prepare(`
          UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ? AND status = 'running'
        `).run(at, id);
        return { pending: true, job: mapJob(getById.get(id)) };
      });
    },
    markCancelled(id, at) {
      return tx(() => {
        const job = mapJob(getById.get(id));
        if (!job || (job.status !== 'running' && job.status !== 'queued')) return job;
        db.prepare(`
          UPDATE jobs
          SET status = 'cancelled', error_code = 'cancelled', error_message = 'Cancelled.',
              cancel_requested = 1, finished_at = ?, updated_at = ?
          WHERE id = ? AND status IN ('running', 'queued')
        `).run(at, at, id);
        return mapJob(getById.get(id));
      });
    },
    markFailed(id, code, message, { terminal = true } = {}) {
      return tx(() => {
        const job = mapJob(getById.get(id));
        if (!job || job.status !== 'running') return job;
        const at = now();
        if (!terminal && job.attempt < job.maxAttempts) {
          db.prepare(`
            UPDATE jobs
            SET status = 'queued', error_code = NULL, error_message = NULL,
                heartbeat_at = NULL, updated_at = ?
            WHERE id = ? AND status = 'running'
          `).run(at, id);
          return mapJob(getById.get(id));
        }
        db.prepare(`
          UPDATE jobs
          SET status = 'failed', error_code = ?, error_message = ?, finished_at = ?, updated_at = ?
          WHERE id = ? AND status = 'running'
        `).run(code, message, at, at, id);
        return mapJob(getById.get(id));
      });
    },
    markSucceeded(id, artifact) {
      return tx(() => {
        const job = mapJob(getById.get(id));
        if (!job || job.status !== 'running') return { stale: true, job };
        if (job.cancelRequested) return { cancelled: true, job };
        if (artifact.classification !== 'rendered') {
          throw new Error('only rendered artifacts can be stored');
        }
        const at = now();
        db.prepare(`
          INSERT INTO artifacts (
            id, job_id, classification, role, mime, byte_size, sha256, width, height,
            duration_ms, luma_stdev, relative_path, expires_at, created_at
          ) VALUES (?, ?, 'rendered', 'master', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          artifact.id,
          id,
          artifact.mime,
          artifact.byteSize,
          artifact.sha256,
          artifact.width,
          artifact.height,
          artifact.durationMs,
          artifact.lumaStdev,
          artifact.relativePath,
          artifact.expiresAt,
          at,
        );
        db.prepare(`
          UPDATE jobs
          SET status = 'succeeded', error_code = NULL, error_message = NULL,
              finished_at = ?, updated_at = ?, heartbeat_at = ?
          WHERE id = ? AND status = 'running' AND cancel_requested = 0
        `).run(at, at, at, id);
        return { job: mapJob(getById.get(id)) };
      });
    },
    recoverOrphanedRunning() {
      return tx(() => {
        const rows = db.prepare("SELECT * FROM jobs WHERE status = 'running'").all().map(mapJob);
        let requeued = 0;
        let failed = 0;
        const at = now();
        for (const job of rows) {
          if (job.attempt >= job.maxAttempts) {
            db.prepare(`
              UPDATE jobs
              SET status = 'failed', error_code = 'worker_lost',
                  error_message = 'Worker stopped before the job finished.',
                  finished_at = ?, updated_at = ?
              WHERE id = ? AND status = 'running'
            `).run(at, at, job.id);
            failed += 1;
          } else {
            db.prepare(`
              UPDATE jobs
              SET status = 'queued', heartbeat_at = NULL, updated_at = ?
              WHERE id = ? AND status = 'running'
            `).run(at, job.id);
            requeued += 1;
          }
        }
        return { requeued, failed };
      });
    },
    releaseForShutdown(id) {
      return tx(() => {
        const job = mapJob(getById.get(id));
        if (!job || job.status !== 'running') return job;
        const at = now();
        const attempt = Math.max(0, job.attempt - 1);
        db.prepare(`
          UPDATE jobs
          SET status = 'queued', attempt = ?, heartbeat_at = NULL, started_at = NULL, updated_at = ?
          WHERE id = ? AND status = 'running'
        `).run(attempt, at, id);
        return mapJob(getById.get(id));
      });
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
    seedJob(partial) {
      const at = partial.createdAt ?? now();
      const id = partial.id || randomUUID();
      const brief = partial.brief || {
        kind: 'video',
        locale: 'en',
        headline: 'Seed',
        subline: '',
        callToAction: '',
        brandName: 'Lines',
        width: 640,
        height: 360,
        durationMs: 2000,
        backgroundColor: '#102a43',
        foregroundColor: '#f7f3ea',
      };
      insertJob.run(
        id,
        partial.tenantId || 'tenant-a',
        partial.customerId || 'cust-a',
        brief.kind,
        partial.status || 'running',
        JSON.stringify(brief),
        partial.requestHash || 'seed',
        partial.idempotencyKey || `seed-${id}`,
        partial.provider || 'local-ffmpeg',
        partial.attempt ?? 1,
        partial.maxAttempts ?? 2,
        partial.cancelRequested ? 1 : 0,
        partial.errorCode ?? null,
        partial.errorMessage ?? null,
        at,
        partial.updatedAt ?? at,
        partial.startedAt ?? at,
        partial.finishedAt ?? null,
        partial.heartbeatAt ?? at,
        partial.deadlineAt ?? at + 60_000,
        partial.timeoutMs ?? 15_000,
        partial.artifactTtlMs ?? 86_400_000,
      );
      return mapJob(getById.get(id));
    },
    close() {
      db.close();
    },
  };
}
