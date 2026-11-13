import { APP_SCOPES, WORKER_ENGINES, WORKER_SCOPE } from './constants.js';
import { generateSecret, generateToken, hashToken, tokenPrefix, assertTokenShape } from './auth.js';

const ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

function assertId(value, label) {
  if (typeof value !== 'string' || !ID_RE.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

export function installAppKey(store, input, defaults) {
  assertId(input.tenantId, 'tenant id');
  const keyId = input.id || input.tenantId;
  assertId(keyId, 'key id');
  if (!assertTokenShape(input.token)) throw new Error('token must be 24 to 256 URL-safe characters');
  const scopes = input.scopes?.length ? input.scopes : [...APP_SCOPES];
  for (const scope of scopes) {
    if (!APP_SCOPES.includes(scope)) throw new Error('app key scope is invalid');
  }
  const existing = store.getTenant(input.tenantId);
  const previousSecret = store.webhookSecret(input.tenantId);
  const webhookSecret = input.webhookSecret || previousSecret || generateSecret();
  if (typeof webhookSecret !== 'string' || webhookSecret.length < 16) throw new Error('webhook secret is invalid');
  store.upsertTenant({
    id: input.tenantId,
    jobsPerHour: input.jobsPerHour ?? existing?.jobsPerHour ?? defaults.jobsPerHour,
    videoSecondsPerMonth: input.videoSecondsPerMonth ?? existing?.videoSecondsPerMonth ?? defaults.videoSecondsPerMonth,
    webhookSecret,
  });
  store.upsertKey({
    id: keyId,
    tenantId: input.tenantId,
    kind: 'app',
    tokenHash: hashToken(input.token),
    tokenPrefix: tokenPrefix(input.token),
    scopes,
    engines: null,
  });
  return {
    keyId,
    tenantId: input.tenantId,
    token: input.token,
    scopes,
    webhookSecret: input.webhookSecret || !previousSecret ? webhookSecret : null,
  };
}

export function installWorkerKey(store, input) {
  assertId(input.id, 'worker id');
  if (!assertTokenShape(input.token)) throw new Error('token must be 24 to 256 URL-safe characters');
  const engines = normalizeEngines(input.engines?.length ? input.engines : ['moneyprinter']);
  store.upsertKey({
    id: input.id,
    tenantId: null,
    kind: 'worker',
    tokenHash: hashToken(input.token),
    tokenPrefix: tokenPrefix(input.token),
    scopes: [WORKER_SCOPE],
    engines,
  });
  return { keyId: input.id, token: input.token, engines };
}

export function setWorkerEngines(store, id, engines) {
  assertId(id, 'worker id');
  const next = normalizeEngines(engines);
  const key = store.listKeys().find((item) => item.id === id && item.status === 'active');
  if (!key || key.kind !== 'worker') throw new Error('worker key not found');
  if (!store.setKeyEngines(id, next)) throw new Error('worker key not found');
  return { keyId: id, engines: next };
}

function normalizeEngines(engines) {
  if (!Array.isArray(engines) || engines.length === 0) throw new Error('worker engine is invalid');
  const unique = [];
  for (const engine of engines) {
    if (!WORKER_ENGINES.includes(engine)) throw new Error('worker engine is invalid');
    if (!unique.includes(engine)) unique.push(engine);
  }
  return unique;
}

export function rotateKey(store, id) {
  const key = store.listKeys().find((item) => item.id === id && item.status === 'active');
  if (!key) throw new Error('key not found');
  const token = generateToken();
  store.upsertKey({
    id: key.id,
    tenantId: key.tenantId,
    kind: key.kind,
    tokenHash: hashToken(token),
    tokenPrefix: tokenPrefix(token),
    scopes: key.scopes,
    engines: key.kind === 'worker' ? key.engines : null,
  });
  return { keyId: key.id, tenantId: key.tenantId, kind: key.kind, token };
}

export function rotateWebhook(store, tenantId) {
  const existing = store.getTenant(tenantId);
  if (!existing) throw new Error('tenant not found');
  const webhookSecret = generateSecret();
  store.upsertTenant({
    id: tenantId,
    jobsPerHour: existing.jobsPerHour,
    videoSecondsPerMonth: existing.videoSecondsPerMonth,
    webhookSecret,
  });
  return { tenantId, webhookSecret };
}

export function formatKeyLine(result) {
  const lines = [`keyId: ${result.keyId}`];
  if (result.tenantId) lines.push(`tenantId: ${result.tenantId}`);
  if (result.kind) lines.push(`kind: ${result.kind}`);
  if (result.token) lines.push(`token: ${result.token}`);
  if (result.webhookSecret) lines.push(`webhookSecret: ${result.webhookSecret}`);
  if (result.engines) lines.push(`engines: ${result.engines.join(',')}`);
  return `${lines.join('\n')}\n`;
}
