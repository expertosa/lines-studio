import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { APP_SCOPES, WORKER_SCOPE } from './constants.js';
import { ApiError } from './errors.js';

const TOKEN_RE = /^[A-Za-z0-9._~+/=_-]+$/;
const END_USER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FORBIDDEN_QUERY = ['access_token', 'token', 'api_key', 'key', 'authorization'];

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenPrefix(token) {
  return token.slice(0, 12);
}

export function generateToken() {
  return `lns_${randomBytes(32).toString('base64url')}`;
}

export function generateSecret() {
  return randomBytes(32).toString('base64url');
}

export function hashesEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function assertTokenShape(token) {
  return typeof token === 'string' && token.length >= 24 && token.length <= 256 && TOKEN_RE.test(token);
}

export function readBearer(header) {
  if (Array.isArray(header) || typeof header !== 'string') return null;
  const match = header.match(/^Bearer ([A-Za-z0-9._~+/=_-]+)$/);
  if (!match || !assertTokenShape(match[1])) return null;
  return match[1];
}

export function singleHeader(req, name) {
  const value = req.headers[name];
  if (Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', 'Repeated headers are not allowed.');
  }
  return value;
}

export function endUserId(req) {
  const value = singleHeader(req, 'x-end-user-id');
  if (value === undefined) return null;
  if (typeof value !== 'string' || !END_USER_RE.test(value)) {
    throw new ApiError(400, 'invalid_end_user', 'X-End-User-Id is invalid.');
  }
  return value;
}

export function assertNoCredentialQuery(req) {
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    throw new ApiError(400, 'invalid_request', 'Request URL is invalid.');
  }
  for (const name of FORBIDDEN_QUERY) {
    if (url.searchParams.has(name)) {
      throw new ApiError(400, 'invalid_request', 'Credentials must be sent in the Authorization header.');
    }
  }
  return url;
}

export function authenticate(store, token) {
  if (!assertTokenShape(token)) return null;
  const incoming = hashToken(token);
  const key = store.getActiveKeyByHash(incoming);
  if (!key || !hashesEqual(key.tokenHash, incoming)) return null;
  return key;
}

function requireKey(req, store) {
  assertNoCredentialQuery(req);
  const token = readBearer(singleHeader(req, 'authorization'));
  const key = token ? authenticate(store, token) : null;
  if (!key) throw new ApiError(401, 'unauthorized', 'Authentication is required.');
  return key;
}

export function assertApp(req, store, scope) {
  const key = requireKey(req, store);
  if (key.kind !== 'app') {
    throw new ApiError(403, 'forbidden', 'This credential cannot call that route.');
  }
  if (!key.scopes.includes(scope)) {
    throw new ApiError(403, 'forbidden', 'This credential does not have the required scope.');
  }
  if (!APP_SCOPES.includes(scope)) {
    throw new ApiError(403, 'forbidden', 'This credential does not have the required scope.');
  }
  return {
    keyId: key.id,
    kind: 'app',
    tenantId: key.tenantId,
    endUserId: endUserId(req),
  };
}

export function assertWorker(req, store) {
  const key = requireKey(req, store);
  if (key.kind !== 'worker' || !key.scopes.includes(WORKER_SCOPE)) {
    throw new ApiError(403, 'forbidden', 'A worker credential is required.');
  }
  return {
    keyId: key.id,
    kind: 'worker',
    engines: key.engines,
  };
}
