import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_SCOPES } from '../src/constants.js';
import { createApp } from '../src/app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serviceRoot = path.resolve(here, '..');
export const repoRoot = path.resolve(serviceRoot, '../..');

export const APP_TOKEN = 'test-app-token-experto-web-aaa';
export const OTHER_TOKEN = 'test-app-token-other-tenant-bbb';
export const READ_TOKEN = 'test-app-token-read-only-cccc';
export const WORKER_TOKEN = 'test-worker-token-mac-mini-ddd';
export const WEBHOOK_SECRET = 'test-webhook-secret-experto-web';
export const OTHER_SECRET = 'test-webhook-secret-other-tenant';

export function jobBody(extra = {}) {
  return {
    reference: 'order-1001',
    title: 'عرض من اكسبرتو',
    prompt: 'منتج جديد من اكسبرتو',
    style: 'promo',
    format: '9:16',
    language: 'ar',
    seconds: 15,
    ...extra,
  };
}

export async function createTestApp(overrides = {}) {
  const dataDir = overrides.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'lines-api-'));
  const calls = [];
  const app = await createApp({
    dataDir,
    autostart: false,
    enableTemplate: true,
    enableBlender: overrides.enableBlender,
    enableUgc: overrides.enableUgc,
    enableLocalize: overrides.enableLocalize,
    defaultEngine: 'moneyprinter',
    signingKey: 'test-signing-key',
    now: overrides.now,
    pollMs: 50,
    limits: {
      leaseMs: 30_000,
      maxAttempts: 2,
      jobsPerHour: 20,
      videoSecondsPerMonth: 36_000,
      webhookBackoffMs: [1000, 2000, 4000],
      ...(overrides.limits || {}),
    },
    keys: overrides.keys || [
      {
        id: 'experto-web',
        tenantId: 'experto-web',
        token: APP_TOKEN,
        webhookSecret: WEBHOOK_SECRET,
        jobsPerHour: overrides.jobsPerHour,
        videoSecondsPerMonth: overrides.videoSecondsPerMonth,
      },
      {
        id: 'other-app',
        tenantId: 'other-app',
        token: OTHER_TOKEN,
        webhookSecret: OTHER_SECRET,
      },
    ],
    workerKeys: overrides.workerKeys || [
      { id: 'mac-mini', token: WORKER_TOKEN, engines: ['moneyprinter'] },
    ],
    trustProxy: overrides.trustProxy,
    trustedProxies: overrides.trustedProxies,
    authFailLimit: overrides.authFailLimit,
    authFailWindowMs: overrides.authFailWindowMs,
    lockWaitMs: overrides.lockWaitMs,
    lockPollMs: overrides.lockPollMs,
    lockTtlMs: overrides.lockTtlMs,
    lockHeartbeatMs: overrides.lockHeartbeatMs,
    lockHandoffPollMs: overrides.lockHandoffPollMs,
    lockHostname: overrides.lockHostname,
    lockBootFile: overrides.lockBootFile,
    onListen: overrides.onListen,
    onHandoff: overrides.onHandoff,
    webhookLookup: overrides.webhookLookup || (async () => ['8.8.8.8']),
    webhookTransport: overrides.webhookTransport || (async (request) => {
      calls.push(request);
      return { status: 204 };
    }),
    webhookPorts: overrides.webhookPorts,
  });
  return {
    app,
    dataDir,
    calls,
    async close() {
      await app.close();
      fs.rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export async function api(app, method, urlPath, { token, body, headers, raw } = {}) {
  const response = await fetch(app.url + urlPath, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : (body !== undefined ? JSON.stringify(body) : undefined),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, json, text, buffer };
}

export function createJob(app, token, body = jobBody(), key = `idem-${Math.random().toString(16).slice(2, 10)}`) {
  return api(app, 'POST', '/v1/jobs', {
    token,
    body,
    headers: { 'idempotency-key': key },
  });
}

export { APP_SCOPES };
