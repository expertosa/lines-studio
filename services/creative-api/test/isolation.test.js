import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, OTHER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

test('a job is visible only to the tenant that created it', async () => {
  const ctx = await createTestApp();
  try {
    const created = await api(ctx.app, 'POST', '/v1/jobs', {
      token: APP_TOKEN,
      body: jobBody(),
      headers: { 'idempotency-key': 'idem-isolation-1', 'x-end-user-id': 'user-1' },
    });
    assert.equal(created.status, 202);
    const id = created.json.id;
    const owner = await api(ctx.app, 'GET', `/v1/jobs/${id}`, {
      token: APP_TOKEN,
      headers: { 'x-end-user-id': 'user-b' },
    });
    assert.equal(owner.status, 200);
    assert.equal(owner.json.endUserId, 'user-1');
    const stranger = await api(ctx.app, 'GET', `/v1/jobs/${id}`, { token: OTHER_TOKEN });
    assert.equal(stranger.status, 404);
    const list = await api(ctx.app, 'GET', '/v1/jobs', { token: OTHER_TOKEN });
    assert.equal(list.status, 200);
    assert.deepEqual(list.json.jobs, []);
    const cancel = await api(ctx.app, 'POST', `/v1/jobs/${id}/cancel`, { token: OTHER_TOKEN });
    assert.equal(cancel.status, 404);
    const missingArtifact = await api(ctx.app, 'GET', `/v1/jobs/${id}/artifacts/00000000-0000-4000-8000-000000000001`, { token: OTHER_TOKEN });
    assert.equal(missingArtifact.status, 404);
  } finally {
    await ctx.close();
  }
});

test('cancelling a queued job is terminal and idempotent for the owner', async () => {
  const ctx = await createTestApp();
  try {
    const created = await createJob(ctx.app, APP_TOKEN, jobBody({
      reference: 'cancel-me',
      callbackUrl: 'https://hooks.example/cancel',
    }), 'idem-cancel-1');
    const first = await api(ctx.app, 'POST', `/v1/jobs/${created.json.id}/cancel`, { token: APP_TOKEN });
    assert.equal(first.status, 200);
    assert.equal(first.json.status, 'cancelled');
    const second = await api(ctx.app, 'POST', `/v1/jobs/${created.json.id}/cancel`, { token: APP_TOKEN, body: {} });
    assert.equal(second.status, 200);
    assert.equal(second.json.status, 'cancelled');
    await ctx.app.tick();
    const failed = ctx.calls.filter((call) => call.body.includes('"event":"job.failed"'));
    const cancelled = ctx.calls.filter((call) => call.body.includes('"event":"job.cancelled"'));
    assert.equal(failed.length, 0);
    assert.equal(cancelled.length, 1);
  } finally {
    await ctx.close();
  }
});
