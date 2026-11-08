import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCredentials } from '../src/auth.js';
import { createApp } from '../src/app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const serviceRoot = path.resolve(here, '..');
export const repoRoot = path.resolve(serviceRoot, '../..');

export const TOKENS = Object.freeze({
  gateway: 'gateway-token-0123456789abcdef',
  tenantA: 'tenant-a-token-0123456789abcdef',
  tenantB: 'tenant-b-token-0123456789abcdef',
  readOnly: 'read-only-token-0123456789abcd',
  writeOnly: 'write-only-token-0123456789abc',
});

const ALL_SCOPES = ['jobs:write', 'jobs:read', 'jobs:cancel', 'artifacts:read'];

export function credentials() {
  return parseCredentials(JSON.stringify([
    { id: 'experto-web', token: TOKENS.gateway, tenants: ['*'], scopes: ALL_SCOPES },
    { id: 'tenant-a', token: TOKENS.tenantA, tenants: ['tenant-a'], scopes: ALL_SCOPES },
    { id: 'tenant-b', token: TOKENS.tenantB, tenants: ['tenant-b'], scopes: ALL_SCOPES },
    { id: 'read-only', token: TOKENS.readOnly, tenants: ['*'], scopes: ['jobs:read', 'artifacts:read'] },
    { id: 'write-only', token: TOKENS.writeOnly, tenants: ['*'], scopes: ['jobs:write'] },
  ]));
}

export function videoBrief(overrides = {}) {
  return {
    kind: 'video',
    locale: 'en',
    headline: 'Branch opening',
    subline: 'Book a free visit',
    callToAction: 'Book now',
    brandName: 'Lines Studio',
    width: 640,
    height: 360,
    durationMs: 2000,
    backgroundColor: '#102A43',
    foregroundColor: '#F7F3EA',
    ...overrides,
  };
}

export function adBrief(overrides = {}) {
  const brief = videoBrief(overrides);
  delete brief.durationMs;
  brief.kind = 'ad_creative';
  return brief;
}

export async function startApp(overrides = {}) {
  const dataDir = overrides.dataDir || fs.mkdtempSync(path.join(os.tmpdir(), 'ls-creative-'));
  const nowBox = { t: overrides.nowStart ?? 1_800_000_000_000 };
  const app = await createApp({
    dataDir,
    credentials: overrides.credentials || credentials(),
    providerName: overrides.providerName || 'local-ffmpeg',
    provider: overrides.provider,
    allowProviderOverride: overrides.provider !== undefined,
    now: () => nowBox.t,
    worker: overrides.worker ?? false,
    pollMs: overrides.pollMs ?? 20,
    timeoutOverrideMs: overrides.timeoutOverrideMs,
    host: '127.0.0.1',
    port: 0,
    limits: overrides.limits,
    ffmpegPath: overrides.ffmpegPath,
    ffprobePath: overrides.ffprobePath,
    log: () => {},
  });
  return {
    app,
    dataDir,
    nowBox,
    base: app.url,
    close: () => app.close(),
  };
}

export function holdProvider() {
  return {
    name: 'hold',
    ready: true,
    generative: false,
    paidCalls: false,
    async render() {
      throw Object.assign(new Error('hold provider cannot render'), { code: 'RENDER_FAILED' });
    },
  };
}

export async function api(base, options) {
  const headers = new Headers(options.headers || {});
  if (options.token) headers.set('authorization', `Bearer ${options.token}`);
  if (options.tenant) headers.set('x-tenant-id', options.tenant);
  if (options.customer) headers.set('x-customer-id', options.customer);
  if (options.idempotency) headers.set('idempotency-key', options.idempotency);
  let body;
  if (options.rawBody !== undefined) {
    body = options.rawBody;
    if (options.contentType) headers.set('content-type', options.contentType);
  } else if (options.body !== undefined) {
    headers.set('content-type', options.contentType || 'application/json');
    body = JSON.stringify(options.body);
  }
  const response = await fetch(base + options.path, {
    method: options.method || 'GET',
    headers,
    body,
    redirect: 'manual',
  });
  const buf = Buffer.from(await response.arrayBuffer());
  const type = response.headers.get('content-type') || '';
  return {
    status: response.status,
    headers: response.headers,
    buf,
    json: type.includes('json') && buf.length ? JSON.parse(buf.toString('utf8')) : null,
  };
}

export function gateway(extra = {}) {
  return {
    token: TOKENS.gateway,
    tenant: 'tenant-a',
    customer: 'cust-a',
    ...extra,
  };
}

export async function waitTerminal(ctx, id, auth, timeoutMs = 20000) {
  const started = Date.now();
  let last;
  while (Date.now() - started < timeoutMs) {
    last = await api(ctx.base, { method: 'GET', path: `/v1/creative-jobs/${id}`, ...auth });
    if (['succeeded', 'failed', 'cancelled'].includes(last.json?.status)) return last;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  throw new Error(`job did not finish: ${JSON.stringify(last?.json)}`);
}

export function runNode(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: serviceRoot, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        code,
        stdout: Buffer.concat(out).toString('utf8'),
        stderr: Buffer.concat(err).toString('utf8'),
      });
    });
  });
}
