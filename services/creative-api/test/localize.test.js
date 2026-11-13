import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { APP_TOKEN, OTHER_TOKEN, WORKER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

const LOCALIZE_TOKEN = 'test-worker-token-localize-ggg';

function localizeBody(extra = {}, spec = {}) {
  const body = jobBody({
    reference: 'ad-loc-1',
    title: 'إعلان القهوة بنسخة سعودية',
    style: 'localize',
    format: '9:16',
    seconds: 30,
    localize: {
      source: { url: 'https://cdn.example.com/ads/coffee-global.mp4' },
      swaps: [
        { kind: 'character', preset: 'saudi-man' },
        { kind: 'outfit', preset: 'thobe-shemagh' },
        { kind: 'product', target: 'علبة قهوة سعودية بشعار المتجر', referenceUrl: 'https://cdn.example.com/products/qahwa.png' },
        { kind: 'background', preset: 'riyadh-boulevard' },
      ],
      captions: { dialect: 'najdi', text: 'صباحك أحلى مع قهوتنا' },
      dub: true,
      consent: { likeness: true },
      ...spec,
    },
    ...extra,
  });
  delete body.prompt;
  return body;
}

function details(res) {
  return JSON.stringify(res.json?.error?.details);
}

function hasDetail(res, path, code) {
  return res.json.error.details.some((d) => d.path === path && d.code === code);
}

test('localize is hidden and rejected until enabled', async () => {
  const ctx = await createTestApp();
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    assert.equal(styles.json.styles.some((style) => style.id === 'localize'), false);
    const res = await createJob(ctx.app, APP_TOKEN, localizeBody(), 'idem-loc-off');
    assert.equal(res.status, 422);
    assert.ok(hasDetail(res, 'style', 'enum'), details(res));
    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.deepEqual(health.json.engines.localize, { enabled: false, mode: 'pull', paidCalls: true, swapModel: 'aleph2', translateModel: 'heygen_precision' });
  } finally {
    await ctx.close();
  }
});

test('localize style is listed with its own engine and no prompt is needed', async () => {
  const ctx = await createTestApp({ enableLocalize: true });
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    const style = styles.json.styles.find((item) => item.id === 'localize');
    assert.equal(style.engine, 'localize');
    assert.equal(style.requiresLocalize, true);
    const quote = await api(ctx.app, 'GET', '/v1/quote?seconds=30&style=localize&format=9:16&language=ar', { token: APP_TOKEN });
    assert.equal(quote.status, 200);
    assert.equal(quote.json.engine, 'localize');
    assert.equal(quote.json.amount, 0);
    assert.equal(quote.json.cost.estimateUsd, 9.15);
    assert.equal(quote.json.cost.withinCap, true);
    assert.equal(quote.json.cost.language, 'Arabic (Saudi Arabia)');
    const quoteFour = await api(ctx.app, 'GET', '/v1/quote?seconds=30&style=localize&format=9:16&language=ar&swaps=4&dub=1', { token: APP_TOKEN });
    assert.equal(quoteFour.json.cost.estimateUsd, 9.15);

    const created = await createJob(ctx.app, APP_TOKEN, localizeBody(), 'idem-loc-ok');
    assert.equal(created.status, 202, created.text);
    const job = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(job.json.status, 'queued');
    assert.equal(job.json.engine, 'localize');
    assert.equal(job.json.prompt, null);
    assert.equal(job.json.localize.source.url, 'https://cdn.example.com/ads/coffee-global.mp4');
    assert.equal(job.json.localize.swaps.length, 4);
    assert.deepEqual(job.json.localize.captions, { dialect: 'najdi', text: 'صباحك أحلى مع قهوتنا' });
    assert.equal(job.json.localize.dub, true);
    assert.deepEqual(job.json.localize.consent, { likeness: true });
    assert.equal(job.json.cost.estimateUsd, 9.15);
    assert.equal(job.json.cost.breakdown.aleph.generations, 1);

    const replay = await createJob(ctx.app, APP_TOKEN, localizeBody(), 'idem-loc-ok');
    assert.equal(replay.status, 202);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    const changed = await createJob(ctx.app, APP_TOKEN, localizeBody({}, { dub: false }), 'idem-loc-ok');
    assert.equal(changed.status, 409);

    assert.equal((await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: OTHER_TOKEN })).status, 404);
  } finally {
    await ctx.close();
  }
});

test('localize validation: source, swaps, dialect and consent', async () => {
  const ctx = await createTestApp({ enableLocalize: true });
  try {
    let n = 0;
    const bad = async (body, path, code) => {
      const res = await createJob(ctx.app, APP_TOKEN, body, `idem-loc-bad-${n += 1}`);
      assert.equal(res.status, 422, `${path} ${res.text}`);
      assert.ok(hasDetail(res, path, code), `${path}/${code}: ${details(res)}`);
    };
    const noSpec = localizeBody();
    delete noSpec.localize;
    await bad(noSpec, 'localize', 'required');
    await bad(localizeBody({}, { source: { url: 'http://cdn.example.com/a.mp4' } }), 'localize.source.url', 'format');
    await bad(localizeBody({}, { source: undefined }), 'localize.source', 'required');
    await bad(localizeBody({}, { swaps: [{ kind: 'weather', target: 'مطر' }] }), 'localize.swaps[0].kind', 'enum');
    await bad(localizeBody({}, { swaps: [{ kind: 'outfit', preset: 'kimono' }] }), 'localize.swaps[0].preset', 'enum');
    await bad(localizeBody({}, { swaps: [{ kind: 'product' }] }), 'localize.swaps[0].target', 'required');
    await bad(localizeBody({}, { swaps: Array.from({ length: 31 }, () => ({ kind: 'background', preset: 'alula' })) }), 'localize.swaps', 'format');
    await bad(localizeBody({}, { captions: { dialect: 'egyptian' } }), 'localize.captions.dialect', 'enum');
    await bad(localizeBody({}, { captions: undefined, dub: true }), 'localize.captions.dialect', 'required');
    await bad(localizeBody({}, { consent: { likeness: false } }), 'localize.consent.likeness', 'required');
    await bad(localizeBody({}, { consent: undefined, swaps: [{ kind: 'character', preset: 'saudi-woman' }], dub: false }), 'localize.consent.likeness', 'required');
    await bad(localizeBody({}, { swaps: [], captions: undefined, dub: false }), 'localize.swaps', 'required');
    await bad(localizeBody({}, { extra: 1 }), 'localize.extra', 'unknown');
    await bad(jobBody({ localize: { source: { url: 'https://cdn.example.com/a.mp4' } } }), 'localize', 'unknown');

    // Backgrounds and products only: no people touched, so no likeness consent needed.
    const ok = await createJob(ctx.app, APP_TOKEN, localizeBody({}, {
      swaps: [{ kind: 'background', preset: 'jeddah-corniche' }, { kind: 'product', target: 'عبوة تمر' }],
      captions: { dialect: 'hijazi' },
      dub: false,
      consent: undefined,
    }), 'idem-loc-no-people');
    assert.equal(ok.status, 202, ok.text);
  } finally {
    await ctx.close();
  }
});

test('localize source and reference links must be public', async () => {
  const ctx = await createTestApp({
    enableLocalize: true,
    webhookLookup: async (host) => (host === 'intranet.example.com' ? ['10.0.0.5'] : ['8.8.8.8']),
  });
  try {
    const internal = await createJob(ctx.app, APP_TOKEN, localizeBody({}, { source: { url: 'https://intranet.example.com/ad.mp4' } }), 'idem-loc-ssrf-1');
    assert.equal(internal.status, 422);
    assert.equal(internal.json.error.code, 'ssrf_blocked');
    const ref = await createJob(ctx.app, APP_TOKEN, localizeBody({}, {
      swaps: [{ kind: 'product', referenceUrl: 'https://intranet.example.com/p.png' }],
    }), 'idem-loc-ssrf-2');
    assert.equal(ref.status, 422);
    assert.equal(ref.json.error.code, 'ssrf_blocked');
  } finally {
    await ctx.close();
  }
});

test('localize jobs go only to a localize worker, with the spec', async () => {
  const ctx = await createTestApp({
    enableLocalize: true,
    workerKeys: [
      { id: 'mac-mini', token: WORKER_TOKEN, engines: ['moneyprinter'] },
      { id: 'localize-worker', token: LOCALIZE_TOKEN, engines: ['localize'] },
    ],
  });
  try {
    const created = await createJob(ctx.app, APP_TOKEN, localizeBody(), 'idem-loc-claim');
    assert.equal(created.status, 202);
    assert.equal((await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} })).json.job, null);
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: LOCALIZE_TOKEN, body: {} });
    assert.equal(claim.json.job.id, created.json.id);
    assert.equal(claim.json.job.engine, 'localize');
    assert.equal(claim.json.job.localize.swaps[1].preset, 'thobe-shemagh');
    assert.equal(claim.json.job.localize.captions.dialect, 'najdi');
    assert.equal(claim.json.job.cost.estimateUsd, 9.15);
    assert.equal(claim.json.job.cost.withinCap, true);

    // The worker can fail it honestly while the swap model is not connected.
    const fail = await api(ctx.app, 'POST', `/v1/worker/jobs/${created.json.id}/fail`, {
      token: LOCALIZE_TOKEN,
      body: { code: 'provider_unavailable', message: 'No video swap model is connected.', retry: false },
    });
    assert.equal(fail.status, 200, fail.text);
    const job = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(job.json.status, 'failed');
    assert.equal(job.json.error.code, 'provider_unavailable');
  } finally {
    await ctx.close();
  }
});

test('an existing data directory gains the localize column without losing jobs', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-api-migrate-'));
  const first = await createTestApp({ dataDir });
  const created = await createJob(first.app, APP_TOKEN, jobBody(), 'idem-before-migrate');
  assert.equal(created.status, 202);
  await first.app.close();
  // Simulate a database from before this change.
  const db = new DatabaseSync(path.join(dataDir, 'creative.sqlite'));
  db.exec('ALTER TABLE jobs DROP COLUMN localize_json');
  db.close();
  const second = await createTestApp({ dataDir, enableLocalize: true });
  try {
    const old = await api(second.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(old.status, 200);
    assert.equal(old.json.localize, undefined);
    const fresh = await createJob(second.app, APP_TOKEN, localizeBody(), 'idem-after-migrate');
    assert.equal(fresh.status, 202, fresh.text);
  } finally {
    await second.close();
  }
});

test('the site form and MCP tool offer the same kinds, presets and dialects as the API', async () => {
  const { adDialects, adPresets, adSwapKinds } = await import('../../../lib/ads.js');
  const { DIALECTS, SWAP_KINDS, SWAP_PRESETS } = await import('../src/engines/localize.js');
  assert.deepEqual(adSwapKinds.map((k) => k.id), [...SWAP_KINDS]);
  assert.deepEqual(adDialects.map((d) => d.id), [...DIALECTS]);
  for (const kind of SWAP_KINDS) assert.deepEqual(adPresets[kind].map((p) => p.id), [...SWAP_PRESETS[kind]], kind);
});
