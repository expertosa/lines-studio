import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, WORKER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

const UGC_TOKEN = 'test-worker-token-ugc-worker-fff';

function ugcBody(extra = {}) {
  return jobBody({
    reference: 'ugc-1',
    style: 'ugc',
    format: '9:16',
    seconds: 15,
    script: { text: 'تدرون وش اللي غيّر شغلي هالشهر؟ اكسبرتو.' },
    metadata: { presenter: 'yousef' },
    ...extra,
  });
}

test('ugc is hidden until enabled', async () => {
  const ctx = await createTestApp();
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    assert.equal(styles.json.styles.some((style) => style.id === 'ugc'), false);
    assert.equal((await createJob(ctx.app, APP_TOKEN, ugcBody(), 'idem-ugc-off')).status, 422);
  } finally {
    await ctx.close();
  }
});

test('ugc needs a written script, vertical format and 15 or 30 seconds', async () => {
  const ctx = await createTestApp({ enableUgc: true });
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    const ugc = styles.json.styles.find((style) => style.id === 'ugc');
    assert.deepEqual(ugc.formats, ['9:16']);
    assert.deepEqual(ugc.seconds, [15, 30]);
    assert.equal(ugc.requiresScript, true);
    assert.equal(ugc.engine, 'ugc');

    const bad = async (extra, key, path, code) => {
      const res = await createJob(ctx.app, APP_TOKEN, ugcBody(extra), key);
      assert.equal(res.status, 422, key);
      assert.ok(res.json.error.details.some((d) => d.path === path && d.code === code), JSON.stringify(res.json.error.details));
    };
    await bad({ script: undefined, prompt: 'اكتب نص عن اكسبرتو' }, 'idem-ugc-noscript', 'script.text', 'required');
    await bad({ format: '16:9' }, 'idem-ugc-format', 'format', 'enum');
    await bad({ seconds: 60 }, 'idem-ugc-60', 'seconds', 'enum');
    await bad({ voice: 'ar-SA-HamedNeural' }, 'idem-ugc-voice', 'voice', 'enum');

    const quote = await api(ctx.app, 'GET', '/v1/quote?seconds=15&style=ugc&format=9:16&language=ar', { token: APP_TOKEN });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.engine, 'ugc');
    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.deepEqual(health.json.engines.ugc, { enabled: true, mode: 'pull', paidCalls: true });
  } finally {
    await ctx.close();
  }
});

test('ugc jobs go only to a worker that renders ugc', async () => {
  const ctx = await createTestApp({
    enableUgc: true,
    workerKeys: [
      { id: 'mac-mini', token: WORKER_TOKEN, engines: ['moneyprinter'] },
      { id: 'ugc-worker', token: UGC_TOKEN, engines: ['ugc'] },
    ],
  });
  try {
    const created = await createJob(ctx.app, APP_TOKEN, ugcBody(), 'idem-ugc-on');
    assert.equal(created.status, 202);
    assert.equal((await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} })).json.job, null);
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: UGC_TOKEN, body: {} });
    assert.equal(claim.json.job.id, created.json.id);
    assert.equal(claim.json.job.engine, 'ugc');
    assert.equal(claim.json.job.voice, 'presenter');
    assert.equal(claim.json.job.metadata.presenter, 'yousef');
    assert.match(claim.json.job.script.text, /اكسبرتو/);
  } finally {
    await ctx.close();
  }
});
