import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

test('the same idempotency key replays one job and a different body conflicts', async () => {
  const ctx = await createTestApp({ jobsPerHour: 1 });
  try {
    const first = await createJob(ctx.app, APP_TOKEN, jobBody({ title: 'عرض من اكسبرتو' }), 'idem-same-001');
    assert.equal(first.status, 202);
    assert.equal(first.json.status, 'queued');
    assert.equal(first.headers.get('idempotency-replayed'), null);
    const replay = await createJob(ctx.app, APP_TOKEN, jobBody({ title: 'عرض من اكسبرتو' }), 'idem-same-001');
    assert.equal(replay.status, 202);
    assert.equal(replay.json.id, first.json.id);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    const conflict = await createJob(ctx.app, APP_TOKEN, jobBody({ title: 'عنوان آخر' }), 'idem-same-001');
    assert.equal(conflict.status, 409);
    assert.equal(conflict.json.error.code, 'idempotency_conflict');
    const third = await createJob(ctx.app, APP_TOKEN, jobBody({ reference: 'other' }), 'idem-other-01');
    assert.equal(third.status, 429);
    const list = await api(ctx.app, 'GET', '/v1/jobs', { token: APP_TOKEN });
    assert.equal(list.json.jobs.length, 1);
  } finally {
    await ctx.close();
  }
});
