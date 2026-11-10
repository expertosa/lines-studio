import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, WORKER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

test('an expired worker lease returns the job to the queue until attempts run out', async () => {
  let clock = Date.parse('2026-11-10T12:00:00.000Z');
  const ctx = await createTestApp({
    now: () => clock,
    limits: { leaseMs: 1_000, maxAttempts: 2 },
  });
  try {
    const created = await createJob(ctx.app, APP_TOKEN, jobBody({
      callbackUrl: 'https://hooks.example/lease',
    }), 'idem-lease-0001');
    assert.equal(created.json.status, 'queued');
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.status, 200);
    assert.equal(claim.json.job.id, created.json.id);
    assert.equal(claim.json.job.engine, 'moneyprinter');
    assert.equal(claim.json.job.voice, 'ar-SA-HamedNeural');
    clock += 1_001;
    await ctx.app.tick();
    const requeued = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(requeued.json.status, 'queued');
    const again = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(again.json.job.attempt, 2);
    const beat = await api(ctx.app, 'POST', `/v1/worker/jobs/${created.json.id}/heartbeat`, { token: WORKER_TOKEN, body: {} });
    assert.equal(beat.status, 200);
    assert.equal(beat.json.cancelRequested, false);
    clock += 500;
    await ctx.app.tick();
    const held = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(held.json.status, 'running');
    clock += 1_001;
    await ctx.app.tick();
    const failed = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(failed.json.status, 'failed');
    assert.equal(failed.json.error.code, 'lease_expired');
    assert.equal(ctx.calls.some((call) => call.body.includes('"event":"job.failed"')), true);
  } finally {
    await ctx.close();
  }
});
