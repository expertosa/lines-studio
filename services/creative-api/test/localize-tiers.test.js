import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';
import { TIER_INFO, estimateLocalizeCost, geminiSegments } from '../src/engines/localize.js';

function tierBody(tier, spec = {}) {
  const body = jobBody({
    reference: `ad-tier-${tier}`,
    title: 'إعلان بنسخة سعودية',
    style: 'localize',
    format: '9:16',
    seconds: 30,
    localize: {
      tier,
      source: { url: 'https://cdn.example.com/ads/coffee-global.mp4' },
      captions: { dialect: 'najdi', text: 'هلا والله! قهوتنا الجديدة وصلت، جربها اليوم.' },
      dub: true,
      consent: { likeness: true },
      ...spec,
    },
  });
  delete body.prompt;
  return body;
}

const quoteUrl = (extra) => `/v1/quote?seconds=30&style=localize&format=9:16&language=ar${extra}`;

test('quote prices each tier from the same table the site uses', async () => {
  const ctx = await createTestApp({ enableLocalize: true });
  try {
    const free = await api(ctx.app, 'GET', quoteUrl('&tier=free'), { token: APP_TOKEN });
    assert.equal(free.status, 200, free.text);
    assert.equal(free.json.tier, 'free');
    assert.equal(free.json.cost.estimateUsd, 0);
    assert.equal(free.json.cost.swapsSupported, false);
    assert.equal(free.json.tierInfo.watermark, false);

    const economy = await api(ctx.app, 'GET', quoteUrl('&tier=economy&swaps=3'), { token: APP_TOKEN });
    assert.equal(economy.status, 200, economy.text);
    assert.equal(economy.json.cost.geminiSegments, 2);
    assert.equal(Number(economy.json.cost.estimateUsd.toFixed(2)), 2.1);
    assert.equal(economy.json.cost.breakdown.gemini.resolution, '720p');

    const pro = await api(ctx.app, 'GET', quoteUrl('&tier=pro&swaps=3'), { token: APP_TOKEN });
    assert.equal(pro.json.cost.estimateUsd, 9.15);
    const dflt = await api(ctx.app, 'GET', quoteUrl(''), { token: APP_TOKEN });
    assert.equal(dflt.json.tier, 'pro');

    const bad = await api(ctx.app, 'GET', quoteUrl('&tier=gold'), { token: APP_TOKEN });
    assert.equal(bad.status, 422);
    assert.equal(bad.json.error.details[0].path, 'tier');
    const freeSwaps = await api(ctx.app, 'GET', quoteUrl('&tier=free&swaps=2'), { token: APP_TOKEN });
    assert.equal(freeSwaps.status, 422);
    assert.deepEqual(freeSwaps.json.error.details[0], { path: 'swaps', code: 'tier_unsupported' });
    const otherStyle = await api(ctx.app, 'GET', '/v1/quote?seconds=30&style=promo&format=9:16&language=ar&tier=free', { token: APP_TOKEN });
    assert.equal(otherStyle.status, 422);
  } finally {
    await ctx.close();
  }
});

test('free tier: dub only, no swaps, Saudi line required; tier is stored', async () => {
  const ctx = await createTestApp({ enableLocalize: true });
  try {
    const ok = await createJob(ctx.app, APP_TOKEN, tierBody('free'), 'idem-tier-free');
    assert.equal(ok.status, 202, ok.text);
    const job = await api(ctx.app, 'GET', `/v1/jobs/${ok.json.id}`, { token: APP_TOKEN });
    assert.equal(job.json.localize.tier, 'free');
    assert.equal(job.json.cost.estimateUsd, 0);
    assert.equal(job.json.cost.withinCap, true);

    const swaps = await createJob(ctx.app, APP_TOKEN, tierBody('free', { swaps: [{ kind: 'background', preset: 'alula' }] }), 'idem-tier-free-swaps');
    assert.equal(swaps.status, 422);
    assert.ok(swaps.json.error.details.some((d) => d.path === 'localize.swaps' && d.code === 'tier_unsupported'));

    const noDub = await createJob(ctx.app, APP_TOKEN, tierBody('free', { dub: false }), 'idem-tier-free-nodub');
    assert.equal(noDub.status, 422);
    assert.ok(noDub.json.error.details.some((d) => d.path === 'localize.dub' && d.code === 'required'));

    const noText = await createJob(ctx.app, APP_TOKEN, tierBody('free', { captions: { dialect: 'najdi' } }), 'idem-tier-free-notext');
    assert.equal(noText.status, 422);
    assert.ok(noText.json.error.details.some((d) => d.path === 'localize.captions.text' && d.code === 'required'));

    const badTier = await createJob(ctx.app, APP_TOKEN, tierBody('platinum'), 'idem-tier-bad');
    assert.equal(badTier.status, 422);
    assert.ok(badTier.json.error.details.some((d) => d.path === 'localize.tier' && d.code === 'enum'));
  } finally {
    await ctx.close();
  }
});

test('economy tier accepts swaps and is priced per Gemini segment', async () => {
  const ctx = await createTestApp({ enableLocalize: true });
  try {
    const res = await createJob(ctx.app, APP_TOKEN, tierBody('economy', { swaps: [{ kind: 'background', preset: 'riyadh-boulevard' }] }), 'idem-tier-eco');
    assert.equal(res.status, 202, res.text);
    const job = await api(ctx.app, 'GET', `/v1/jobs/${res.json.id}`, { token: APP_TOKEN });
    assert.equal(job.json.localize.tier, 'economy');
    assert.equal(job.json.cost.geminiSegments, 2);
    assert.equal(job.json.cost.alephGenerations, 0);
  } finally {
    await ctx.close();
  }
});

test('tier estimator: segments, cap and table', () => {
  assert.deepEqual(geminiSegments(15), [15]);
  assert.deepEqual(geminiSegments(30), [15, 15]);
  assert.equal(geminiSegments(60).length, 4);
  assert.deepEqual(geminiSegments(2), []);
  const capped = estimateLocalizeCost({ seconds: 60, swapCount: 1, tier: 'economy', maxUsd: 1 });
  assert.equal(capped.withinCap, false);
  const freeWithSwaps = estimateLocalizeCost({ seconds: 30, swapCount: 1, tier: 'free', dub: true });
  assert.equal(freeWithSwaps.withinCap, false);
  assert.equal(TIER_INFO.free.usdPer30s, 0);
  assert.equal(Number(TIER_INFO.economy.usdPer30s.toFixed(2)), 2.1);
  assert.equal(Number(TIER_INFO.pro.usdPer30s.toFixed(2)), 9.15);
  for (const tier of Object.values(TIER_INFO)) assert.equal(tier.watermark, false);
});
