import fs from 'node:fs';
import { ApiError } from './errors.js';
import { isInside, safeJoin } from './paths.js';
import { presentJob } from './present.js';
import { assertIdentity, assertNoCredentialQuery } from './auth.js';
import { requestHash, timeoutFor, validateBrief } from './validate.js';

const JOB_ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const ROUTES = [
  { method: 'GET', re: /^\/v1\/health$/, auth: false, handler: health },
  { method: 'POST', re: /^\/v1\/creative-jobs$/, scope: 'jobs:write', handler: createJob },
  { method: 'GET', re: /^\/v1\/creative-jobs$/, scope: 'jobs:read', handler: listJobs },
  { method: 'GET', re: new RegExp(`^\\/v1\\/creative-jobs\\/${JOB_ID}$`), scope: 'jobs:read', handler: getJob },
  { method: 'POST', re: new RegExp(`^\\/v1\\/creative-jobs\\/${JOB_ID}\\/cancel$`), scope: 'jobs:cancel', handler: cancelJob },
  { method: 'GET', re: new RegExp(`^\\/v1\\/creative-jobs\\/${JOB_ID}\\/artifacts\\/${JOB_ID}$`), scope: 'artifacts:read', handler: downloadArtifact },
];
const STATUSES = new Set(['queued', 'running', 'succeeded', 'failed', 'cancelled']);

function send(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    ...extra,
  });
  res.end(payload);
}

function present(ctx, job) {
  return presentJob(job, ctx.store.artifactsFor(job.id));
}

function pathname(req) {
  const url = new URL(req.url, 'http://127.0.0.1');
  if (url.pathname.includes('..') || url.pathname.includes('\\')) {
    throw new ApiError(404, 'not_found', 'Not found.');
  }
  return url;
}

async function health(req, res, ctx) {
  const ready = Boolean(ctx.provider.ready) && ctx.provider.paidCalls === false;
  send(res, 200, {
    ok: true,
    ready,
    service: 'lines-creative-api',
    provider: ctx.provider.name,
    generative: false,
    paidCalls: false,
    publishSupported: false,
    fixtureFulfillment: false,
    capabilities: ready && ctx.provider.name === 'local-ffmpeg'
      ? ['template-video', 'template-still']
      : [],
  });
}

function isJsonContent(header) {
  return typeof header === 'string' && /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(header.trim());
}

function readBody(req, limit) {
  const declared = req.headers['content-length'];
  if (declared !== undefined && (!/^\d+$/.test(String(declared)) || Number(declared) > limit)) {
    req.resume();
    return Promise.reject(new ApiError(413, 'payload_too_large', 'Request body is too large.'));
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        failed = true;
        reject(new ApiError(413, 'payload_too_large', 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!failed) resolve(Buffer.concat(chunks));
    });
    req.on('error', () => {
      if (!failed) reject(new ApiError(400, 'invalid_request', 'Request body could not be read.'));
    });
  });
}

async function readJson(req, limit) {
  if (!isJsonContent(req.headers['content-type'])) {
    req.resume();
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  const raw = await readBody(req, limit);
  if (raw.length === 0) throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
    const plain = Object.create(null);
    for (const key of Object.keys(parsed)) plain[key] = parsed[key];
    return plain;
  } catch {
    throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
  }
}

function idempotencyKey(req) {
  const value = req.headers['idempotency-key'];
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new ApiError(400, 'invalid_idempotency_key', 'Idempotency-Key is required.');
  }
  return value;
}

async function createJob(req, res, ctx, identity) {
  if (!ctx.provider.ready || ctx.provider.paidCalls !== false || ctx.provider.generative !== false) {
    req.resume();
    throw new ApiError(503, 'provider_unavailable', 'Local render engine is not available. No paid provider is configured.');
  }
  const key = idempotencyKey(req);
  const body = await readJson(req, ctx.limits.maxBodyBytes);
  const brief = validateBrief(body);
  const result = ctx.store.createOrReplay({
    tenantId: identity.tenantId,
    customerId: identity.customerId,
    idempotencyKey: key,
    requestHash: requestHash(brief),
    brief,
    provider: ctx.provider.name,
    timeoutMs: ctx.timeoutOverrideMs ?? timeoutFor(brief),
    deadlineAt: ctx.now() + ctx.limits.deadlineMs,
    maxAttempts: ctx.limits.maxAttempts,
    artifactTtlMs: ctx.limits.artifactTtlMs,
  }, ctx.limits.maxJobsPerHour);
  if (result.rateLimited) {
    throw new ApiError(429, 'rate_limited', 'Generation limit reached for this customer.', [
      { path: 'customer', code: 'hourly_limit', limit: ctx.limits.maxJobsPerHour },
    ]);
  }
  if (result.conflict) {
    throw new ApiError(409, 'idempotency_conflict', 'Idempotency-Key was reused with a different request.');
  }
  const payload = present(ctx, result.job);
  if (result.replay) {
    send(res, 200, payload, { 'idempotency-replayed': 'true' });
    return;
  }
  send(res, 201, payload, { location: `/v1/creative-jobs/${result.job.id}` });
}

function encodeCursor(job) {
  return Buffer.from(JSON.stringify({ t: job.createdAt, id: job.id })).toString('base64url');
}

function decodeCursor(value) {
  if (!value) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new ApiError(422, 'validation_error', 'Cursor is invalid.', [{ path: 'cursor', code: 'format' }]);
  }
  if (!parsed || typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id) || !Number.isInteger(parsed.t)) {
    throw new ApiError(422, 'validation_error', 'Cursor is invalid.', [{ path: 'cursor', code: 'format' }]);
  }
  return { id: parsed.id, createdAt: parsed.t };
}

async function listJobs(req, res, ctx, identity) {
  const url = pathname(req);
  const status = url.searchParams.get('status');
  if (status && !STATUSES.has(status)) {
    throw new ApiError(422, 'validation_error', 'Status filter is invalid.', [{ path: 'status', code: 'enum' }]);
  }
  let limit = 20;
  if (url.searchParams.has('limit')) {
    const raw = url.searchParams.get('limit');
    if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 50) {
      throw new ApiError(422, 'validation_error', 'Limit is invalid.', [{ path: 'limit', code: 'range' }]);
    }
    limit = Number(raw);
  }
  const cursor = decodeCursor(url.searchParams.get('cursor'));
  const page = ctx.store.listOwned({
    tenantId: identity.tenantId,
    customerId: identity.customerId,
    status: status || null,
    cursor,
    limit,
  });
  const last = page.jobs[page.jobs.length - 1];
  send(res, 200, {
    jobs: page.jobs.map((job) => present(ctx, job)),
    nextCursor: page.hasMore && last ? encodeCursor(last) : null,
  });
}

async function getJob(req, res, ctx, identity, jobId) {
  const job = ctx.store.getOwned(jobId, identity.tenantId, identity.customerId);
  if (!job) throw new ApiError(404, 'not_found', 'Job not found.');
  send(res, 200, present(ctx, job));
}

async function cancelJob(req, res, ctx, identity, jobId) {
  if (req.headers['content-length'] && req.headers['content-length'] !== '0') {
    const body = await readJson(req, ctx.limits.maxBodyBytes);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 0) {
      throw new ApiError(422, 'validation_error', 'Cancel does not accept a body.', [{ path: '', code: 'unknown_field' }]);
    }
  } else {
    req.resume();
  }
  const result = ctx.store.requestCancel(jobId, identity.tenantId, identity.customerId, ctx.now());
  if (result.notFound) throw new ApiError(404, 'not_found', 'Job not found.');
  if (result.notCancellable) {
    throw new ApiError(409, 'not_cancellable', 'This job can no longer be cancelled.');
  }
  send(res, 200, present(ctx, result.job));
}

function removeArtifact(ctx, artifact) {
  try {
    fs.rmSync(safeJoin(ctx.dataDir, artifact.relativePath), { force: true });
  } catch {
    // The row is still removed so a missing file cannot be downloaded later.
  }
  ctx.store.deleteArtifact(artifact.id);
}

async function downloadArtifact(req, res, ctx, identity, jobId, artifactId) {
  const artifact = ctx.store.artifactForOwner(artifactId, jobId, identity.tenantId, identity.customerId);
  if (!artifact || artifact.classification !== 'rendered') {
    throw new ApiError(404, 'not_found', 'Artifact not found.');
  }
  if (artifact.expiresAt <= ctx.now()) {
    removeArtifact(ctx, artifact);
    throw new ApiError(410, 'expired', 'Artifact has expired.');
  }
  let filePath;
  try {
    filePath = safeJoin(ctx.dataDir, artifact.relativePath);
  } catch {
    throw new ApiError(404, 'not_found', 'Artifact not found.');
  }
  if (!isInside(ctx.dataDir, filePath) || !fs.existsSync(filePath)) {
    throw new ApiError(404, 'not_found', 'Artifact not found.');
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size !== artifact.byteSize) {
    throw new ApiError(404, 'not_found', 'Artifact not found.');
  }
  const extension = artifact.mime === 'video/mp4' ? '.mp4' : '.png';
  res.writeHead(200, {
    'content-type': artifact.mime,
    'content-length': stat.size,
    'content-disposition': `attachment; filename="creative-${artifact.id}${extension}"`,
    'x-content-sha256': artifact.sha256,
    etag: `"${artifact.sha256}"`,
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
    'x-artifact-classification': 'rendered',
    'referrer-policy': 'no-referrer',
  });
  fs.createReadStream(filePath).pipe(res);
}

export function createHandler(ctx) {
  return async function handle(req, res) {
    try {
      assertNoCredentialQuery(req);
      const url = pathname(req);
      const matches = ROUTES.filter((route) => route.re.test(url.pathname));
      if (matches.length === 0) throw new ApiError(404, 'not_found', 'Not found.');
      const route = matches.find((item) => item.method === req.method);
      if (!route) {
        const error = new ApiError(405, 'method_not_allowed', 'Method is not allowed.');
        error.allow = [...new Set(matches.map((item) => item.method))].join(', ');
        throw error;
      }
      const match = url.pathname.match(route.re);
      if (route.auth === false) {
        await route.handler(req, res, ctx);
        return;
      }
      const identity = assertIdentity(req, ctx.credentials, route.scope);
      await route.handler(req, res, ctx, identity, match[1], match[2]);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof ApiError) {
        req.resume();
        const extra = {};
        if (error.status === 401) extra['www-authenticate'] = 'Bearer realm="lines-creative"';
        if (error.status === 429) extra['retry-after'] = '60';
        if (error.status === 503) extra['retry-after'] = '30';
        if (error.allow) extra.allow = error.allow;
        send(res, error.status, {
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        }, extra);
        return;
      }
      ctx.log('error', { code: 'internal', message: String(error?.message || 'error').slice(0, 300) });
      send(res, 500, { error: { code: 'internal', message: 'Internal error.' } });
    }
  };
}
