import assert from 'node:assert/strict';
import test from 'node:test';
import { clientIp } from '../src/auth-limit.js';
import { APP_TOKEN, WORKER_TOKEN, api, createJob, createTestApp } from './helpers.js';

const HSTS = 'max-age=31536000; includeSubDomains';
const BAD = 'not-a-real-token-0123456789';

test('moneyprinter stays offline until a worker polls, then ages out after two leases', async () => {
  let now = 1_700_000_000_000;
  const ctx = await createTestApp({ now: () => now });
  try {
    const before = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(before.json.engines.moneyprinter.ready, false);
    assert.equal(before.json.engines.moneyprinter.worker, 'offline');
    assert.equal(before.headers.get('strict-transport-security'), HSTS);

    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.status, 200);
    assert.equal(claim.json.job, null);
    const online = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(online.json.engines.moneyprinter.ready, true);
    assert.equal(online.json.engines.moneyprinter.worker, 'online');

    now += 60_000;
    const edge = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(edge.json.engines.moneyprinter.worker, 'online');

    now += 1;
    const stale = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(stale.json.engines.moneyprinter.ready, false);
    assert.equal(stale.json.engines.moneyprinter.worker, 'offline');

    const missing = await api(ctx.app, 'GET', '/v1/missing');
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('strict-transport-security'), HSTS);
  } finally {
    await ctx.close();
  }
});

test('a heartbeat keeps the moneyprinter worker online for another two leases', async () => {
  let now = 1_700_000_000_000;
  const ctx = await createTestApp({ now: () => now });
  try {
    const created = await createJob(ctx.app, APP_TOKEN);
    assert.equal(created.status, 202);
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.status, 200);
    assert.equal(claim.json.job.id, created.json.id);

    now += 10_000;
    const beat = await api(ctx.app, 'POST', `/v1/worker/jobs/${created.json.id}/heartbeat`, { token: WORKER_TOKEN, body: {} });
    assert.equal(beat.status, 200);

    now += 60_000;
    const online = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(online.json.engines.moneyprinter.worker, 'online');

    now += 1;
    const offline = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(offline.json.engines.moneyprinter.worker, 'offline');
  } finally {
    await ctx.close();
  }
});

test('a worker that does not render moneyprinter does not flip that engine online', async () => {
  const ctx = await createTestApp({
    enableBlender: true,
    workerKeys: [{ id: 'blend', token: WORKER_TOKEN, engines: ['blender'] }],
  });
  try {
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.status, 200);
    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(health.json.engines.moneyprinter.ready, false);
    assert.equal(health.json.engines.moneyprinter.worker, 'offline');
  } finally {
    await ctx.close();
  }
});

test('repeated failed auth from one IP returns 429 and health stays open', async () => {
  const ctx = await createTestApp({ authFailLimit: 3 });
  try {
    const first = await api(ctx.app, 'GET', '/v1/styles', { token: BAD });
    const second = await api(ctx.app, 'GET', '/v1/styles', { token: BAD });
    const third = await api(ctx.app, 'GET', '/v1/styles', { token: BAD });
    assert.equal(first.status, 401);
    assert.equal(second.status, 401);
    assert.equal(third.status, 429);
    assert.equal(third.json.error.code, 'rate_limited');
    assert.ok(Number(third.headers.get('retry-after')) >= 1);
    assert.equal(third.headers.get('strict-transport-security'), HSTS);

    const locked = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    assert.equal(locked.status, 429);

    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(health.status, 200);
    assert.equal(health.json.ok, true);
  } finally {
    await ctx.close();
  }
});

test('failed-auth limits are per forwarded IP only when the proxy is trusted', async () => {
  const ctx = await createTestApp({ authFailLimit: 2, trustProxy: true });
  try {
    const headers = (ip) => ({ 'x-forwarded-for': ip });
    const a1 = await api(ctx.app, 'GET', '/v1/styles', { token: BAD, headers: headers('203.0.113.10') });
    const a2 = await api(ctx.app, 'GET', '/v1/styles', { token: BAD, headers: headers('203.0.113.10') });
    const b1 = await api(ctx.app, 'GET', '/v1/styles', { token: BAD, headers: headers('203.0.113.11') });
    assert.equal(a1.status, 401);
    assert.equal(a2.status, 429);
    assert.equal(b1.status, 401);
  } finally {
    await ctx.close();
  }
});

test('client IP uses the proxy headers only when asked', () => {
  const req = {
    socket: { remoteAddress: '10.0.0.8' },
    headers: {
      'cf-connecting-ip': '203.0.113.5',
      'x-real-ip': '198.51.100.3',
      'x-forwarded-for': '198.51.100.8, 203.0.113.9',
    },
  };
  assert.equal(clientIp(req, false), '10.0.0.8');
  assert.equal(clientIp(req, true), '203.0.113.5');
  assert.equal(clientIp({
    socket: { remoteAddress: '10.0.0.8' },
    headers: { 'cf-connecting-ip': 'nope', 'x-real-ip': '203.0.113.7' },
  }, true), '203.0.113.7');
  assert.equal(clientIp({
    socket: { remoteAddress: '10.0.0.8' },
    headers: { 'x-forwarded-for': '198.51.100.8, 203.0.113.9' },
  }, true), '203.0.113.9');
});
