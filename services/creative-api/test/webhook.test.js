import assert from 'node:assert/strict';
import test from 'node:test';
import { webhookSignature } from '../src/sign.js';
import { APP_TOKEN, WEBHOOK_SECRET, createJob, createTestApp, jobBody } from './helpers.js';

test('webhooks are signed and retried with backoff', async () => {
  let clock = Date.parse('2026-11-10T12:00:00.000Z');
  const calls = [];
  let failures = 0;
  const ctx = await createTestApp({
    now: () => clock,
    limits: { webhookBackoffMs: [5_000], webhookMaxAttempts: 3 },
    webhookTransport: async (request) => {
      calls.push(request);
      failures += 1;
      return { status: failures === 1 ? 500 : 204 };
    },
  });
  try {
    const created = await createJob(ctx.app, APP_TOKEN, jobBody({
      callbackUrl: 'https://hooks.example/api/app/studio/render-callback',
    }), 'idem-webhook-01');
    assert.equal(created.status, 202);
    const cancel = await ctx.app.store.requestCancel(created.json.id, 'experto-web');
    assert.equal(cancel.job.status, 'cancelled');
    await ctx.app.tick();
    assert.equal(calls.length, 1);
    const timestamp = calls[0].headers['x-lines-timestamp'];
    const signature = calls[0].headers['x-lines-signature'];
    assert.equal(signature, webhookSignature(WEBHOOK_SECRET, timestamp, calls[0].body));
    const payload = JSON.parse(calls[0].body);
    assert.equal(payload.event, 'job.cancelled');
    assert.equal(payload.job.id, created.json.id);
    assert.equal(payload.job.status, 'cancelled');
    clock += 4_000;
    await ctx.app.tick();
    assert.equal(calls.length, 1);
    clock += 1_000;
    await ctx.app.tick();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].headers['x-lines-signature'], webhookSignature(WEBHOOK_SECRET, calls[1].headers['x-lines-timestamp'], calls[1].body));
  } finally {
    await ctx.close();
  }
});
