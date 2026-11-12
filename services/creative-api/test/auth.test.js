import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { hashToken } from '../src/auth.js';
import { installAppKey } from '../src/keys.js';
import { resolveLimits } from '../src/limits.js';
import {
  APP_TOKEN,
  OTHER_TOKEN,
  READ_TOKEN,
  WORKER_TOKEN,
  WEBHOOK_SECRET,
  api,
  createJob,
  createTestApp,
  serviceRoot,
} from './helpers.js';

test('health is public and responses carry no CORS header', async () => {
  const ctx = await createTestApp();
  try {
    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
    assert.equal(health.json.service, 'lines-video-api');
    assert.equal(health.json.engines.external.configured, false);
    assert.equal(health.json.engines.moneyprinter.ready, false);
    assert.equal(health.json.engines.moneyprinter.worker, 'offline');
    assert.equal(health.json.engines.moneyprinter.mode, 'pull');
    assert.equal(health.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.equal(health.headers.get('access-control-allow-origin'), null);
    const options = await api(ctx.app, 'OPTIONS', '/v1/jobs');
    assert.equal(options.status, 404);
    assert.equal(options.headers.get('access-control-allow-origin'), null);
  } finally {
    await ctx.close();
  }
});

test('rejects missing, wrong, revoked, and query-string credentials', async () => {
  const ctx = await createTestApp();
  try {
    const missing = await createJob(ctx.app, null);
    assert.equal(missing.status, 401);
    const wrong = await createJob(ctx.app, 'not-a-real-token-0123456789');
    assert.equal(wrong.status, 401);
    const query = await api(ctx.app, 'GET', '/v1/jobs?token=test-app-token-experto-web-aaa', { token: APP_TOKEN });
    assert.equal(query.status, 400);
    const apiKey = await api(ctx.app, 'GET', '/v1/styles?api_key=abcdef', { token: APP_TOKEN });
    assert.equal(apiKey.status, 400);
    ctx.app.store.revokeKey('experto-web');
    const revoked = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    assert.equal(revoked.status, 401);
  } finally {
    await ctx.close();
  }
});

test('scopes are not implied and worker tokens cannot create jobs', async () => {
  const ctx = await createTestApp();
  try {
    installAppKey(ctx.app.store, {
      id: 'reader',
      tenantId: 'experto-web',
      token: READ_TOKEN,
      webhookSecret: WEBHOOK_SECRET,
      scopes: ['jobs:read'],
    }, resolveLimits());
    const denied = await createJob(ctx.app, READ_TOKEN);
    assert.equal(denied.status, 403);
    const allowed = await api(ctx.app, 'GET', '/v1/styles', { token: READ_TOKEN });
    assert.equal(allowed.status, 200);
    assert.ok(allowed.json.styles.some((style) => style.id === 'promo'));
    const quote = await api(ctx.app, 'GET', '/v1/quote?seconds=30&style=promo&format=9:16&language=ar', { token: APP_TOKEN });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.amount, 0);
    assert.equal(quote.json.engine, 'moneyprinter');
    assert.equal(quote.json.voice, 'ar-SA-HamedNeural');
    const workerCreate = await createJob(ctx.app, WORKER_TOKEN);
    assert.equal(workerCreate.status, 403);
    const appClaim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: APP_TOKEN, body: {} });
    assert.equal(appClaim.status, 403);
    const usageDenied = await api(ctx.app, 'GET', '/v1/usage', { token: READ_TOKEN });
    assert.equal(usageDenied.status, 403);
  } finally {
    await ctx.close();
  }
});

test('the key CLI prints a new token once and never prints the stored hash', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-keys-'));
  try {
    const created = spawnSync(process.execPath, [
      path.join(serviceRoot, 'src/keys-cli.js'),
      'create-app',
      '--tenant', 'experto-web',
    ], {
      env: { ...process.env, LINES_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(created.status, 0, created.stderr);
    const token = created.stdout.match(/token: (\S+)/)?.[1];
    assert.ok(token);
    const hash = hashToken(token);
    assert.equal(created.stdout.includes(hash), false);
    assert.equal((created.stderr || '').includes(hash), false);
    assert.match(created.stdout, /webhookSecret: \S+/);
    const listed = spawnSync(process.execPath, [
      path.join(serviceRoot, 'src/keys-cli.js'),
      'list',
    ], {
      env: { ...process.env, LINES_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(listed.status, 0, listed.stderr);
    assert.equal(listed.stdout.includes(token), false);
    assert.equal(listed.stdout.includes(hash), false);
    assert.equal(listed.stdout.includes('webhookSecret'), false);
    const rotated = spawnSync(process.execPath, [
      path.join(serviceRoot, 'src/keys-cli.js'),
      'rotate-key',
      '--id', 'experto-web',
    ], {
      env: { ...process.env, LINES_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    assert.equal(rotated.status, 0, rotated.stderr);
    const next = rotated.stdout.match(/token: (\S+)/)?.[1];
    assert.notEqual(next, token);
    assert.equal(rotated.stdout.includes(hashToken(next)), false);
    assert.equal(rotated.stdout.includes('webhookSecret'), false);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test('a rotated key replaces the previous bearer', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-rotate-'));
  const created = spawnSync(process.execPath, [
    path.join(serviceRoot, 'src/keys-cli.js'),
    'create-app',
    '--tenant', 'experto-web',
  ], {
    env: { ...process.env, LINES_DATA_DIR: dataDir },
    encoding: 'utf8',
  });
  const token = created.stdout.match(/token: (\S+)/)[1];
  const ctx = await createTestApp({ keys: [], workerKeys: [], dataDir });
  try {
    const ok = await api(ctx.app, 'GET', '/v1/styles', { token });
    assert.equal(ok.status, 200);
    const rotated = spawnSync(process.execPath, [
      path.join(serviceRoot, 'src/keys-cli.js'),
      'rotate-key',
      '--id', 'experto-web',
    ], {
      env: { ...process.env, LINES_DATA_DIR: dataDir },
      encoding: 'utf8',
    });
    const next = rotated.stdout.match(/token: (\S+)/)[1];
    const old = await api(ctx.app, 'GET', '/v1/styles', { token });
    const fresh = await api(ctx.app, 'GET', '/v1/styles', { token: next });
    assert.equal(old.status, 401);
    assert.equal(fresh.status, 200);
    assert.equal(OTHER_TOKEN.length > 0, true);
  } finally {
    await ctx.close();
  }
});
