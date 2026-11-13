import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { JOB_STATUSES, SECONDS } from './constants.js';
import { ApiError, CodedError } from './errors.js';
import { assertApp, assertNoCredentialQuery, assertWorker, singleHeader } from './auth.js';
import { storeFile } from './artifacts.js';
import { boundaryFrom, parseMultipart } from './multipart.js';
import { safeJoin } from './paths.js';
import { presentJob, presentWorkerJob } from './present.js';
import { artifactSignature, signaturesEqual } from './sign.js';
import { listStyles } from './styles.js';
import { blenderEngine } from './engines/blender.js';
import { ugcEngine } from './engines/ugc.js';
import { localizeEngine } from './engines/localize.js';
import { validateJob } from './validate.js';
import { clientIp } from './auth-limit.js';

const JOB_ID = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
const HSTS = 'max-age=31536000; includeSubDomains';

function send(res, status, body, extra = {}) {
  const payload = JSON.stringify(body);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'strict-transport-security': HSTS,
    ...extra,
  };
  if (extra['retry-after'] == null && body?.error?.retryAfter) {
    headers['retry-after'] = String(body.error.retryAfter);
  }
  res.writeHead(status, headers);
  res.end(payload);
}

function fail(res, error) {
  const body = {
    error: {
      code: error.code || 'internal',
      message: error.message || 'Request failed.',
      ...(error.details ? { details: error.details } : {}),
    },
  };
  const extra = {};
  if (error.retryAfter) extra['retry-after'] = String(error.retryAfter);
  send(res, error.status || 500, body, extra);
}

function styleOptions(ctx) {
  return {
    enableTemplate: ctx.enableTemplate,
    enableBlender: ctx.enableBlender,
    enableUgc: ctx.enableUgc,
    enableLocalize: ctx.enableLocalize,
    defaultEngine: ctx.defaultEngine,
  };
}

function present(ctx, job, summary = false) {
  return presentJob(job, ctx.store.artifactsFor(job.id), {
    summary,
    now: ctx.now(),
    signing: ctx.signingKey ? { key: ctx.signingKey, ttlMs: ctx.limits.signedUrlTtlMs } : null,
  });
}

function pathname(req) {
  const url = assertNoCredentialQuery(req);
  if (url.pathname.includes('..') || url.pathname.includes('\\') || url.pathname.includes('//')) {
    throw new ApiError(404, 'not_found', 'Not found.');
  }
  return url;
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

async function readJson(req, limit, { required = true } = {}) {
  const raw = await readBody(req, limit);
  if (raw.length === 0) {
    if (!required) return {};
    throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
  }
  if (!isJsonContent(req.headers['content-type'])) {
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
  }
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new ApiError(400, 'invalid_json', 'Request body must be a JSON object.');
    }
    return Object.fromEntries(Object.keys(parsed).map((key) => [key, parsed[key]]));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
  }
}

function idempotencyKey(req) {
  const value = singleHeader(req, 'idempotency-key');
  if (typeof value !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) {
    throw new ApiError(400, 'invalid_idempotency_key', 'Idempotency-Key is required.');
  }
  return value;
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
    throw new ApiError(422, 'validation_error', 'Cursor is invalid.', [
      { path: 'cursor', code: 'format' },
    ]);
  }
  if (!parsed || typeof parsed.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(parsed.id) || !Number.isInteger(parsed.t)) {
    throw new ApiError(422, 'validation_error', 'Cursor is invalid.', [
      { path: 'cursor', code: 'format' },
    ]);
  }
  return { id: parsed.id, createdAt: parsed.t };
}

function moneyprinterReady(ctx) {
  const windowMs = ctx.limits.leaseMs * 2;
  return ctx.presence.online('moneyprinter', ctx.now(), windowMs);
}

export function writeStartupResponse(req, res, phase) {
  let pathname = '/';
  try {
    pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname;
  } catch {
    pathname = '/';
  }
  const accepting = phase !== 'deferred';
  if (req.method === 'GET' && pathname === '/v1/health') {
    send(res, accepting ? 200 : 503, {
      ok: accepting,
      service: 'lines-video-api',
      ready: false,
      lock: accepting ? 'waiting' : 'yielded',
    });
    return;
  }
  if (!req.readableEnded) req.resume();
  send(res, 503, {
    error: {
      code: 'starting',
      message: 'This process is not serving yet.',
      retryAfter: 1,
    },
  });
}

async function health(req, res, ctx) {
  const templateReady = Boolean(ctx.enableTemplate && ctx.template?.ready);
  const workerOnline = moneyprinterReady(ctx);
  send(res, 200, {
    ok: true,
    service: 'lines-video-api',
    ready: true,
    lock: 'held',
    defaultEngine: ctx.defaultEngine,
    engines: {
      template: { enabled: ctx.enableTemplate, ready: templateReady, mode: 'local' },
      moneyprinter: {
        mode: 'pull',
        ready: workerOnline,
        worker: workerOnline ? 'online' : 'offline',
        macRequired: true,
      },
      blender: { enabled: Boolean(ctx.enableBlender), mode: blenderEngine.mode, macRequired: blenderEngine.macRequired },
      ugc: { enabled: Boolean(ctx.enableUgc), mode: ugcEngine.mode, paidCalls: ugcEngine.paidCalls },
      localize: {
        enabled: Boolean(ctx.enableLocalize),
        mode: localizeEngine.mode,
        paidCalls: localizeEngine.paidCalls,
        swapModel: localizeEngine.swapModel,
      },
      external: { configured: false },
    },
  });
}

async function styles(req, res, ctx) {
  assertApp(req, ctx.store, 'jobs:read');
  send(res, 200, { styles: listStyles(styleOptions(ctx)) });
}

async function quote(req, res, ctx) {
  assertApp(req, ctx.store, 'jobs:read');
  const url = pathname(req);
  const allowed = new Set(['seconds', 'style', 'format', 'language']);
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) {
      throw new ApiError(422, 'validation_error', 'Query is invalid.', [{ path: key, code: 'unknown' }]);
    }
  }
  const seconds = Number(url.searchParams.get('seconds'));
  const styleId = url.searchParams.get('style');
  const format = url.searchParams.get('format') || '9:16';
  const language = url.searchParams.get('language') || 'ar';
  const catalog = listStyles(styleOptions(ctx));
  const style = catalog.find((item) => item.id === styleId);
  if (!style || !SECONDS.includes(seconds) || !style.formats.includes(format) || !style.languages.includes(language)) {
    throw new ApiError(422, 'validation_error', 'Quote is invalid.', [
      { path: 'seconds', code: 'enum' },
    ]);
  }
  send(res, 200, {
    style: style.id,
    seconds,
    format,
    language,
    voice: style.defaultVoice[language],
    engine: style.engine,
    currency: 'SAR',
    amount: 0,
    includedInPlan: true,
  });
}

async function createJob(req, res, ctx) {
  const identity = assertApp(req, ctx.store, 'jobs:write');
  const key = idempotencyKey(req);
  const body = await readJson(req, ctx.limits.maxBodyBytes);
  const jobInput = await validateJob(body, {
    ...styleOptions(ctx),
    lookup: ctx.webhookLookup,
    allowedPorts: ctx.webhookPorts,
  });
  if (jobInput.engine === 'template' && !ctx.template?.ready) {
    throw new ApiError(503, 'engine_unavailable', 'Template engine is not available.', undefined, { retryAfter: 30 });
  }
  if (jobInput.engine === 'external') {
    throw new ApiError(503, 'engine_unavailable', 'External engine is not configured.');
  }
  const result = ctx.store.createOrReplay({
    ...jobInput,
    tenantId: identity.tenantId,
    endUserId: identity.endUserId,
    idempotencyKey: key,
    deadlineAt: ctx.now() + ctx.limits.deadlineMs,
    maxAttempts: ctx.limits.maxAttempts,
    artifactTtlMs: ctx.limits.artifactTtlMs,
  });
  if (result.unknownTenant) throw new ApiError(403, 'forbidden', 'This credential cannot act for that tenant.');
  if (result.rateLimited) {
    throw new ApiError(429, 'rate_limited', 'Tenant quota exceeded.', [
      { path: result.scope, code: result.scope === 'hour' ? 'hourly_limit' : 'monthly_seconds', limit: result.limit },
    ], { retryAfter: result.retryAfter });
  }
  if (result.conflict) {
    throw new ApiError(409, 'idempotency_conflict', 'Idempotency-Key was reused with a different request.');
  }
  const extra = { location: `/v1/jobs/${result.job.id}` };
  if (result.replay) extra['idempotency-replayed'] = 'true';
  send(res, 202, { id: result.job.id, status: result.job.status }, extra);
}

async function listJobs(req, res, ctx) {
  const identity = assertApp(req, ctx.store, 'jobs:read');
  const url = pathname(req);
  const status = url.searchParams.get('status');
  if (status && !JOB_STATUSES.includes(status)) {
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
  const page = ctx.store.listOwned({
    tenantId: identity.tenantId,
    status: status || null,
    cursor: decodeCursor(url.searchParams.get('cursor')),
    limit,
  });
  const last = page.jobs[page.jobs.length - 1];
  send(res, 200, {
    jobs: page.jobs.map((job) => present(ctx, job, true)),
    nextCursor: page.hasMore && last ? encodeCursor(last) : null,
  });
}

async function getJob(req, res, ctx, id) {
  const identity = assertApp(req, ctx.store, 'jobs:read');
  const job = ctx.store.getOwned(id, identity.tenantId);
  if (!job) throw new ApiError(404, 'not_found', 'Not found.');
  send(res, 200, present(ctx, job, false));
}

async function cancelJob(req, res, ctx, id) {
  const identity = assertApp(req, ctx.store, 'jobs:cancel');
  const raw = await readBody(req, 1024);
  if (raw.length > 0) {
    if (!isJsonContent(req.headers['content-type'])) {
      throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be application/json.');
    }
    let parsed;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      throw new ApiError(400, 'invalid_json', 'Request body must be JSON.');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 0) {
      throw new ApiError(422, 'validation_error', 'Cancel body must be empty.', [{ path: '', code: 'empty' }]);
    }
  }
  const result = ctx.store.requestCancel(id, identity.tenantId);
  if (result.notFound) throw new ApiError(404, 'not_found', 'Not found.');
  if (result.notCancellable) throw new ApiError(409, 'not_cancellable', 'This job can no longer be cancelled.');
  send(res, 200, { id: result.job.id, status: result.pending ? 'running' : result.job.status, cancelRequested: result.pending || result.job.status === 'cancelled' });
}

async function usage(req, res, ctx) {
  const identity = assertApp(req, ctx.store, 'usage:read');
  const url = pathname(req);
  const fromRaw = url.searchParams.get('from');
  const toRaw = url.searchParams.get('to');
  const from = fromRaw ? Date.parse(fromRaw) : monthFloor(ctx.now());
  const to = toRaw ? Date.parse(toRaw) : ctx.now();
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    throw new ApiError(422, 'validation_error', 'Usage window is invalid.', [{ path: 'from', code: 'range' }]);
  }
  const report = ctx.store.usage({ tenantId: identity.tenantId, from, to });
  send(res, 200, {
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    ...report,
  });
}

function monthFloor(ms) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

function parseRange(header, size) {
  if (!header) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(String(header).trim());
  if (!match || header.includes(',')) return { invalid: true };
  const [, startText, endText] = match;
  if (!startText && !endText) return { invalid: true };
  let start;
  let end;
  if (!startText) {
    const suffix = Number(endText);
    if (!Number.isInteger(suffix) || suffix <= 0) return { invalid: true };
    start = Math.max(size - suffix, 0);
    end = size - 1;
  } else {
    start = Number(startText);
    end = endText ? Number(endText) : size - 1;
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start >= size || end < start) {
    return { unsatisfiable: true };
  }
  return { start, end: Math.min(end, size - 1), partial: true };
}

async function downloadArtifact(req, res, ctx, jobId, artifactId) {
  const url = pathname(req);
  const exp = url.searchParams.get('exp');
  const sig = url.searchParams.get('sig');
  let artifact;
  if (exp || sig) {
    if (!ctx.signingKey || !exp || !sig || !/^\d{1,12}$/.test(exp)) {
      throw new ApiError(401, 'unauthorized', 'Signed URL is invalid.');
    }
    const expected = artifactSignature(ctx.signingKey, exp, jobId, artifactId);
    if (!signaturesEqual(expected, sig) || Number(exp) * 1000 < ctx.now()) {
      throw new ApiError(401, 'unauthorized', 'Signed URL is invalid.');
    }
    artifact = ctx.store.artifactById(artifactId, jobId);
    if (!artifact) throw new ApiError(404, 'not_found', 'Not found.');
  } else {
    const identity = assertApp(req, ctx.store, 'artifacts:read');
    artifact = ctx.store.artifactForOwner(artifactId, jobId, identity.tenantId);
    if (!artifact) throw new ApiError(404, 'not_found', 'Not found.');
  }
  if (artifact.expiresAt <= ctx.now()) {
    throw new ApiError(410, 'expired', 'Artifact has expired.');
  }
  const filePath = safeJoin(ctx.dataDir, artifact.relativePath);
  if (!fs.existsSync(filePath)) throw new ApiError(404, 'not_found', 'Not found.');
  const size = fs.statSync(filePath).size;
  const range = parseRange(req.headers.range, size);
  if (range.invalid || range.unsatisfiable) {
    res.writeHead(416, {
      'content-range': `bytes */${size}`,
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'strict-transport-security': HSTS,
    });
    res.end();
    return;
  }
  const status = range.partial ? 206 : 200;
  const length = range.end - range.start + 1;
  res.writeHead(status, {
    'content-type': artifact.mime,
    'content-length': length,
    'accept-ranges': 'bytes',
    ...(range.partial ? { 'content-range': `bytes ${range.start}-${range.end}/${size}` } : {}),
    'x-content-sha256': artifact.sha256,
    etag: `"${artifact.sha256}"`,
    'content-disposition': `attachment; filename="lines-${artifact.id}.${artifact.mime === 'video/mp4' ? 'mp4' : 'img'}"`,
    'x-content-type-options': 'nosniff',
    'strict-transport-security': HSTS,
    'cache-control': 'private, no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
}

function seenWorker(ctx, worker) {
  ctx.presence.note(worker.keyId, worker.engines, ctx.now());
}

async function workerClaim(req, res, ctx) {
  const worker = assertWorker(req, ctx.store);
  seenWorker(ctx, worker);
  if (!worker.engines?.length) throw new ApiError(403, 'forbidden', 'This worker has no engines.');
  await readJson(req, 2048, { required: false });
  const claimed = ctx.store.claimNext({
    engines: worker.engines,
    owner: worker.keyId,
    leaseMs: ctx.limits.leaseMs,
    concurrency: ctx.limits.maxConcurrency,
  });
  if (!claimed.job) {
    send(res, 200, { job: null });
    return;
  }
  send(res, 200, {
    job: presentWorkerJob(claimed.job),
    leaseExpiresAt: new Date(claimed.job.leaseExpiresAt).toISOString(),
  });
}

async function workerHeartbeat(req, res, ctx, id) {
  const worker = assertWorker(req, ctx.store);
  seenWorker(ctx, worker);
  await readJson(req, 2048, { required: false });
  const result = ctx.store.heartbeat(id, worker.keyId, ctx.limits.leaseMs);
  if (result.mismatch || result.expired) throw new ApiError(409, 'lease_mismatch', 'This worker does not hold the lease.');
  send(res, 200, {
    cancelRequested: result.job.cancelRequested,
    leaseExpiresAt: new Date(result.leaseExpiresAt).toISOString(),
  });
}

async function workerArtifact(req, res, ctx, id) {
  const worker = assertWorker(req, ctx.store);
  seenWorker(ctx, worker);
  const job = ctx.store.readJob(id);
  if (!job || job.status !== 'running' || job.leaseOwner !== worker.keyId) {
    req.resume();
    throw new ApiError(409, 'lease_mismatch', 'This worker does not hold the lease.');
  }
  const boundary = boundaryFrom(req.headers['content-type']);
  if (!boundary) {
    req.resume();
    throw new ApiError(415, 'unsupported_media_type', 'Content-Type must be multipart/form-data.');
  }
  const raw = await readBody(req, ctx.limits.maxVideoBytes + ctx.limits.maxThumbBytes + 1024 * 1024);
  const parts = parseMultipart(raw, boundary);
  const video = parts.find((part) => part.name === 'video');
  const thumbnail = parts.find((part) => part.name === 'thumbnail');
  if (!video && !thumbnail) throw new ApiError(422, 'validation_error', 'A video or thumbnail part is required.', [{ path: 'video', code: 'required' }]);
  const saved = [];
  for (const part of [video, thumbnail].filter(Boolean)) {
    const sniffed = sniff(part.body);
    const mime = part.name === 'video' ? 'video/mp4' : sniffed;
    if (part.name === 'video' && sniffed !== 'video/mp4') {
      throw new ApiError(422, 'artifact_rejected', 'Video part must be an MP4.');
    }
    if (part.name === 'thumbnail' && sniffed !== 'image/png' && sniffed !== 'image/jpeg') {
      throw new ApiError(422, 'artifact_rejected', 'Thumbnail must be a PNG or JPEG.');
    }
    const tmp = safeJoin(ctx.tmpDir, `${randomUUID()}.${mime === 'video/mp4' ? 'mp4' : 'img'}`);
    fs.mkdirSync(ctx.tmpDir, { recursive: true });
    fs.writeFileSync(tmp, part.body);
    try {
      const result = await storeFile(ctx, job, worker.keyId, tmp, { role: part.name === 'video' ? 'video' : 'thumbnail', mime });
      if (result.exists) throw new ApiError(409, 'artifact_exists', 'That artifact role is already stored.');
      if (result.mismatch) throw new ApiError(409, 'lease_mismatch', 'This worker does not hold the lease.');
      saved.push({ id: result.artifact.id, role: result.artifact.role, sha256: result.artifact.sha256, byteSize: result.artifact.byteSize });
    } catch (error) {
      fs.rmSync(tmp, { force: true });
      throw error;
    }
  }
  send(res, 201, { artifacts: saved });
}

function sniff(body) {
  if (body.length >= 12 && body.subarray(4, 8).toString('ascii') === 'ftyp') return 'video/mp4';
  if (body.length >= 8 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return 'image/png';
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  return '';
}

const FAIL_CODES = new Set(['render_failed', 'render_timeout', 'provider_unavailable', 'cancelled', 'artifact_rejected']);

async function workerComplete(req, res, ctx, id) {
  const worker = assertWorker(req, ctx.store);
  seenWorker(ctx, worker);
  await readJson(req, 2048, { required: false });
  const result = ctx.store.complete(id, worker.keyId);
  if (result.mismatch) throw new ApiError(409, 'lease_mismatch', 'This worker does not hold the lease.');
  if (result.missingVideo) throw new ApiError(409, 'artifact_required', 'Upload the video before completing the job.');
  send(res, 200, { id: result.job.id, status: result.job.status });
}

async function workerFail(req, res, ctx, id) {
  const worker = assertWorker(req, ctx.store);
  seenWorker(ctx, worker);
  const body = await readJson(req, 4096);
  const code = FAIL_CODES.has(body.code) ? body.code : 'render_failed';
  const message = typeof body.message === 'string' ? body.message.replace(/https?:\/\/\S+/gi, '[url]').slice(0, 300) : 'Render failed.';
  const retry = body.retry !== false && code !== 'cancelled';
  const result = ctx.store.fail(id, worker.keyId, { code, message, retry });
  if (result.mismatch) throw new ApiError(409, 'lease_mismatch', 'This worker does not hold the lease.');
  send(res, 200, { id: result.job.id, status: result.job.status });
}

const ROUTES = [
  { method: 'GET', re: /^\/v1\/health$/, auth: false, handler: health },
  { method: 'GET', re: /^\/v1\/styles$/, handler: styles },
  { method: 'GET', re: /^\/v1\/quote$/, handler: quote },
  { method: 'POST', re: /^\/v1\/jobs$/, handler: createJob },
  { method: 'GET', re: /^\/v1\/jobs$/, handler: listJobs },
  { method: 'GET', re: /^\/v1\/usage$/, handler: usage },
  { method: 'GET', re: new RegExp(`^\\/v1\\/jobs\\/${JOB_ID}$`), handler: (req, res, ctx, match) => getJob(req, res, ctx, match[1]) },
  { method: 'POST', re: new RegExp(`^\\/v1\\/jobs\\/${JOB_ID}\\/cancel$`), handler: (req, res, ctx, match) => cancelJob(req, res, ctx, match[1]) },
  { method: 'GET', re: new RegExp(`^\\/v1\\/jobs\\/${JOB_ID}\\/artifacts\\/${JOB_ID}$`), handler: (req, res, ctx, match) => downloadArtifact(req, res, ctx, match[1], match[2]) },
  { method: 'HEAD', re: new RegExp(`^\\/v1\\/jobs\\/${JOB_ID}\\/artifacts\\/${JOB_ID}$`), handler: (req, res, ctx, match) => downloadArtifact(req, res, ctx, match[1], match[2]) },
  { method: 'POST', re: /^\/v1\/worker\/claim$/, handler: workerClaim },
  { method: 'POST', re: new RegExp(`^\\/v1\\/worker\\/jobs\\/${JOB_ID}\\/heartbeat$`), handler: (req, res, ctx, match) => workerHeartbeat(req, res, ctx, match[1]) },
  { method: 'POST', re: new RegExp(`^\\/v1\\/worker\\/jobs\\/${JOB_ID}\\/artifacts$`), handler: (req, res, ctx, match) => workerArtifact(req, res, ctx, match[1]) },
  { method: 'POST', re: new RegExp(`^\\/v1\\/worker\\/jobs\\/${JOB_ID}\\/complete$`), handler: (req, res, ctx, match) => workerComplete(req, res, ctx, match[1]) },
  { method: 'POST', re: new RegExp(`^\\/v1\\/worker\\/jobs\\/${JOB_ID}\\/fail$`), handler: (req, res, ctx, match) => workerFail(req, res, ctx, match[1]) },
];

export function createHandler(ctx) {
  return async function handler(req, res) {
    try {
      if (req.method === 'OPTIONS') {
        send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
        return;
      }
      const url = pathname(req);
      if (url.pathname !== '/v1/health') {
        const blocked = ctx.authFailures.check(clientIp(req, ctx.trustProxy, ctx.trustedProxies), ctx.now());
        if (blocked) {
          if (!req.readableEnded) req.resume();
          fail(res, new ApiError(429, 'rate_limited', 'Too many failed authentication attempts.', undefined, { retryAfter: blocked.retryAfter }));
          return;
        }
      }
      const route = ROUTES.find((item) => item.method === req.method && item.re.test(url.pathname));
      if (!route) {
        req.resume();
        send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
        return;
      }
      const match = url.pathname.match(route.re);
      await route.handler(req, res, ctx, match);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (!req.readableEnded) req.resume();
      if (error instanceof ApiError && error.status === 401) {
        const hit = ctx.authFailures.record(clientIp(req, ctx.trustProxy, ctx.trustedProxies), ctx.now());
        if (hit.limited) {
          fail(res, new ApiError(429, 'rate_limited', 'Too many failed authentication attempts.', undefined, { retryAfter: hit.retryAfter }));
          return;
        }
      }
      if (error instanceof ApiError) {
        fail(res, error);
        return;
      }
      if (error instanceof CodedError) {
        fail(res, new ApiError(422, 'artifact_rejected', 'Output did not pass media checks.'));
        return;
      }
      ctx.log('error', { code: 'request', message: String(error?.message || 'error').slice(0, 200) });
      fail(res, new ApiError(500, 'internal', 'Request failed.'));
    }
  };
}
