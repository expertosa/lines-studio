import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, WORKER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

const BLENDER_TOKEN = 'test-worker-token-blender-mac-eee';

test('promo3d is hidden until the Blender engine is enabled', async () => {
  const ctx = await createTestApp();
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    assert.equal(styles.json.styles.some((style) => style.id === 'promo3d'), false);
    const rejected = await createJob(ctx.app, APP_TOKEN, jobBody({ style: 'promo3d' }), 'idem-blender-off');
    assert.equal(rejected.status, 422);
  } finally {
    await ctx.close();
  }
});

test('promo3d jobs go only to a worker that renders blender', async () => {
  const ctx = await createTestApp({
    enableBlender: true,
    workerKeys: [
      { id: 'mac-mini', token: WORKER_TOKEN, engines: ['moneyprinter'] },
      { id: 'mac-blender', token: BLENDER_TOKEN, engines: ['blender'] },
    ],
  });
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    const promo3d = styles.json.styles.find((style) => style.id === 'promo3d');
    assert.equal(promo3d.engine, 'blender');
    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(health.json.engines.blender.enabled, true);

    const created = await createJob(ctx.app, APP_TOKEN, jobBody({
      reference: 'promo3d-1',
      style: 'promo3d',
      format: '16:9',
      metadata: { palette: '#0B1F33,#E8C872,#4FD1C5', hero: 'laptop' },
    }), 'idem-blender-on');
    assert.equal(created.status, 202);

    const moneyprinter = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(moneyprinter.json.job, null);

    const blender = await api(ctx.app, 'POST', '/v1/worker/claim', { token: BLENDER_TOKEN, body: {} });
    assert.equal(blender.status, 200);
    assert.equal(blender.json.job.id, created.json.id);
    assert.equal(blender.json.job.engine, 'blender');
    assert.equal(blender.json.job.style, 'promo3d');
    assert.equal(blender.json.job.width, 1920);
    assert.equal(blender.json.job.height, 1080);
    assert.deepEqual(blender.json.job.metadata, { palette: '#0B1F33,#E8C872,#4FD1C5', hero: 'laptop' });
  } finally {
    await ctx.close();
  }
});
