import { APP_SCOPES, WORKER_SCOPE } from './constants.js';
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
  const engines = input.engines?.length ? input.engines : ['moneyprinter'];
  for (const engine of engines) {
    if (!['moneyprinter', 'template', 'external', 'blender', 'ugc', 'localize'].includes(engine)) throw new Error('worker engine is invalid');
  }
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
