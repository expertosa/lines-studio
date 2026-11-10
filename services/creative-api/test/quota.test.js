import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

test('hourly job quota and monthly video-seconds return 429 with Retry-After', async () => {
  const ctx = await createTestApp({ jobsPerHour: 1, videoSecondsPerMonth: 20 });
  try {
    const first = await createJob(ctx.app, APP_TOKEN, jobBody({ seconds: 15 }), 'idem-quota-0001');
    assert.equal(first.status, 202);
    const hourly = await createJob(ctx.app, APP_TOKEN, jobBody({ reference: 'second', seconds: 15 }), 'idem-quota-0002');
    assert.equal(hourly.status, 429);
    assert.equal(hourly.json.error.code, 'rate_limited');
    assert.ok(Number(hourly.headers.get('retry-after')) >= 1);
    const replay = await createJob(ctx.app, APP_TOKEN, jobBody({ seconds: 15 }), 'idem-quota-0001');
    assert.equal(replay.status, 202);
    assert.equal(replay.json.id, first.json.id);
  } finally {
    await ctx.close();
  }
});

test('monthly video-seconds are reserved at accept time', async () => {
  const ctx = await createTestApp({ jobsPerHour: 10, videoSecondsPerMonth: 20 });
  try {
    const first = await createJob(ctx.app, APP_TOKEN, jobBody({ seconds: 15 }), 'idem-month-0001');
    assert.equal(first.status, 202);
    const second = await createJob(ctx.app, APP_TOKEN, jobBody({ reference: 'month-2', seconds: 15 }), 'idem-month-0002');
    assert.equal(second.status, 429);
    assert.equal(second.json.error.details[0].code, 'monthly_seconds');
    const usage = await api(ctx.app, 'GET', '/v1/usage', { token: APP_TOKEN });
    assert.equal(usage.status, 200);
    assert.equal(usage.json.quota.videoSecondsThisMonth, 15);
    assert.equal(usage.json.jobs, 1);
    await api(ctx.app, 'POST', `/v1/jobs/${first.json.id}/cancel`, { token: APP_TOKEN });
    const after = await createJob(ctx.app, APP_TOKEN, jobBody({ reference: 'month-3', seconds: 15 }), 'idem-month-0003');
    assert.equal(after.status, 202);
  } finally {
    await ctx.close();
  }
});
