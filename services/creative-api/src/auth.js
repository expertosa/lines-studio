import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { SCOPES } from './constants.js';
import { ApiError } from './errors.js';

const SCOPE_SET = new Set(SCOPES);
const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;
const TENANT_RE = /^[A-Za-z0-9_-]{1,64}$/;

function sha256(value) {
  return createHash('sha256').update(value).digest();
}

function hashesEqual(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function parseCredentials(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LINES_CREATIVE_CREDENTIALS is not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('LINES_CREATIVE_CREDENTIALS must be a non-empty array');
  }
  const credentials = [];
  const seenTokens = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('Each credential must be an object');
    }
    const keys = Object.keys(entry);
    for (const key of keys) {
      if (!['id', 'token', 'tenants', 'scopes'].includes(key)) {
        throw new Error('Credential contains an unsupported field');
      }
    }
    if (typeof entry.id !== 'string' || !ID_RE.test(entry.id)) {
      throw new Error('Credential id is invalid');
    }
    if (typeof entry.token !== 'string' || !/^[A-Za-z0-9._~+/-]+=*$/.test(entry.token) || entry.token.length < 24 || entry.token.length > 256) {
      throw new Error('Credential token must be 24 to 256 URL-safe characters');
    }
    if (!Array.isArray(entry.tenants) || entry.tenants.length === 0) {
      throw new Error('Credential tenants must be a non-empty array');
    }
    const tenants = [];
    for (const tenant of entry.tenants) {
      if (tenant === '*') {
        tenants.push('*');
        continue;
      }
      if (typeof tenant !== 'string' || !TENANT_RE.test(tenant)) {
        throw new Error('Credential tenant id is invalid');
      }
      tenants.push(tenant);
    }
    if (!Array.isArray(entry.scopes) || entry.scopes.length === 0) {
      throw new Error('Credential scopes must be a non-empty array');
    }
    const scopes = [];
    for (const scope of entry.scopes) {
      if (!SCOPE_SET.has(scope)) throw new Error('Credential scope is invalid');
      scopes.push(scope);
    }
    const tokenHash = sha256(entry.token);
    for (const existing of seenTokens) {
      if (hashesEqual(existing, tokenHash)) throw new Error('Credential tokens must be unique');
    }
    seenTokens.push(tokenHash);
    credentials.push({
      id: entry.id,
      tokenHash,
      tenants: Object.freeze(tenants),
      scopes: Object.freeze(new Set(scopes)),
    });
  }
  return Object.freeze(credentials);
}

export function loadCredentialsFromEnv(env = process.env) {
  const file = env.LINES_CREATIVE_CREDENTIALS_FILE;
  let raw;
  let permissive = false;
  if (file) {
    if (!path.isAbsolute(file)) {
      throw new Error('LINES_CREATIVE_CREDENTIALS_FILE must be an absolute path');
    }
    const stat = fs.statSync(file);
    permissive = (stat.mode & 0o077) !== 0;
    raw = fs.readFileSync(file, 'utf8');
  } else if (env.LINES_CREATIVE_CREDENTIALS) {
    raw = env.LINES_CREATIVE_CREDENTIALS;
  } else {
    throw new Error('Set LINES_CREATIVE_CREDENTIALS_FILE or LINES_CREATIVE_CREDENTIALS');
  }
  return { credentials: parseCredentials(raw), credentialsFilePermissive: permissive };
}

export function authenticate(credentials, token) {
  if (typeof token !== 'string' || token.length < 24 || token.length > 256) return null;
  const incoming = sha256(token);
  let match = null;
  for (const credential of credentials) {
    if (hashesEqual(credential.tokenHash, incoming)) match = credential;
  }
  return match;
}

export function tenantAllowed(credential, tenantId) {
  return credential.tenants.includes('*') || credential.tenants.includes(tenantId);
}

export function readBearer(header) {
  if (Array.isArray(header) || typeof header !== 'string') return null;
  const match = header.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  if (!match) return null;
  return match[1];
}

const FORBIDDEN_QUERY = ['access_token', 'token', 'api_key', 'tenantId', 'customerId'];

export function assertNoCredentialQuery(req) {
  let url;
  try {
    url = new URL(req.url, 'http://127.0.0.1');
  } catch {
    throw new ApiError(400, 'invalid_request', 'Request URL is invalid.');
  }
  for (const name of FORBIDDEN_QUERY) {
    if (url.searchParams.has(name)) {
      throw new ApiError(400, 'invalid_request', 'Identity must be sent in headers.');
    }
  }
}

export function assertIdentity(req, credentials, scope) {
  assertNoCredentialQuery(req);
  const token = readBearer(req.headers.authorization);
  const credential = token ? authenticate(credentials, token) : null;
  if (!credential) {
    throw new ApiError(401, 'unauthorized', 'Authentication is required.');
  }
  const tenantHeader = req.headers['x-tenant-id'];
  const customerHeader = req.headers['x-customer-id'];
  if (Array.isArray(tenantHeader) || typeof tenantHeader !== 'string' || !TENANT_RE.test(tenantHeader)) {
    throw new ApiError(400, 'invalid_tenant', 'X-Tenant-Id is required.');
  }
  if (Array.isArray(customerHeader) || typeof customerHeader !== 'string' || !TENANT_RE.test(customerHeader)) {
    throw new ApiError(400, 'invalid_customer', 'X-Customer-Id is required.');
  }
  if (!tenantAllowed(credential, tenantHeader)) {
    throw new ApiError(403, 'forbidden', 'This credential cannot act for that tenant.');
  }
  if (!credential.scopes.has(scope)) {
    throw new ApiError(403, 'forbidden', 'This credential does not have the required scope.');
  }
  return {
    credentialId: credential.id,
    tenantId: tenantHeader,
    customerId: customerHeader,
  };
}
