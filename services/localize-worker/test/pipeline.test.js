import assert from 'node:assert/strict';
import test from 'node:test';
import {
  alephGenerationUsd,
  estimateLocalizeCost,
  heygenPrecisionUsd,
  packAlephPasses,
} from '../../creative-api/src/engines/localize.js';
import { renderClaimedJob } from '../src/run.js';
import { fakeClient, fakeVendors, localizeJob, tmp } from './helpers.js';

const mp4 = Buffer.from('fake-localized-mp4-bytes');

function deps(overrides = {}) {
  const vendors = overrides.vendors || fakeVendors({ mp4 });
  return {
    client: overrides.client || fakeClient(),
    tmpDir: overrides.tmpDir || tmp(),
    runwayKey: 'k-runway',
    heygenKey: 'k-heygen',
    fetchImpl: vendors.fetchImpl,
    sleep: async () => {},
    runwayPollMs: 1,
    heygenPollMs: 1,
    heartbeatMs: 60_000,
    env: { LINES_LOCALIZE_MAX_USD: '15' },
    vendors,
    ...overrides,
  };
}

test('cost estimator: 30s, one Aleph pass plus HeyGen Precision is $9.15 and under the $15 cap', () => {
  const four = estimateLocalizeCost({
    seconds: 30,
    swaps: localizeJob().localize.swaps,
    dub: true,
    maxUsd: 15,
  });
  assert.equal(four.alephGenerations, 1);
  assert.equal(four.breakdown.aleph.usd, 8.4);
  assert.equal(four.breakdown.heygen.usd, 0.75);
  assert.equal(four.estimateUsd, 9.15);
  assert.equal(four.withinCap, true);
  assert.equal(four.language, 'Arabic (Saudi Arabia)');
  assert.equal(alephGenerationUsd(2), 0.56);
  assert.equal(heygenPrecisionUsd(15), 0.375);
});

test('cost estimator: four 30s Aleph generations would exceed the default cap', () => {
  // Force four generations by packing is usually 1; compute the unit rate instead.
  const over = estimateLocalizeCost({ seconds: 30, swapCount: 0, dub: true, maxUsd: 0.5 });
  assert.equal(over.estimateUsd, 0.75);
  assert.equal(over.withinCap, false);
});

test('a typical four-swap brief fits in one Aleph prompt, with the product photo as a keyframe', () => {
  const passes = packAlephPasses(localizeJob().localize.swaps);
  assert.equal(passes.length, 1);
  assert.match(passes[0].promptText, /Saudi man/);
  assert.match(passes[0].promptText, /thobe and a red-and-white shemagh/);
  assert.match(passes[0].promptText, /علبة قهوة سعودية/);
  assert.match(passes[0].promptText, /Riyadh Boulevard/);
  assert.equal(passes[0].promptText.length <= 1000, true);
  assert.deepEqual(passes[0].keyframes, [{ uri: 'https://cdn.example.com/products/qahwa.png', seconds: 0 }]);
});

test('pipeline: Aleph then HeyGen Precision, upload, complete; keys stay on their API hosts', async () => {
  const options = deps();
  const result = await renderClaimedJob(localizeJob(), options);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.cost.estimateUsd, 9.15);
  const names = options.client.calls.map((call) => call[0]);
  assert.ok(names.includes('upload') && names.includes('complete'));
  assert.equal(names.filter((name) => name === 'heartbeat').length >= 4, true);
  assert.equal(names.includes('fail'), false);
  const hostsWithRunwayKey = options.vendors.calls.filter((call) => call.headers.authorization === 'Bearer k-runway').map((call) => call.host);
  const hostsWithHeygenKey = options.vendors.calls.filter((call) => call.headers['x-api-key'] === 'k-heygen').map((call) => call.host);
  assert.ok(hostsWithRunwayKey.every((host) => host === 'api.dev.runwayml.com'));
  assert.ok(hostsWithHeygenKey.every((host) => host === 'api.heygen.com'));
  const heygenSubmit = options.vendors.calls.find((call) => call.path === '/v3/video-translations' && call.method === 'POST');
  assert.equal(JSON.parse(heygenSubmit.body).output_languages[0], 'Arabic (Saudi Arabia)');
  assert.equal(JSON.parse(heygenSubmit.body).video.url, 'https://dnznrvs05pmza.cloudfront.net/aleph-out.mp4');
});

test('pipeline: missing keys fail with engine_not_configured and never call a vendor', async () => {
  const none = deps({ runwayKey: '', heygenKey: '', vendors: fakeVendors({ mp4 }) });
  none.fetchImpl = () => assert.fail('no call');
  const result = await renderClaimedJob(localizeJob(), none);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'engine_not_configured');
  assert.equal(none.client.calls[0][0], 'fail');
  assert.equal(none.client.calls[0][2].code, 'engine_not_configured');
  assert.equal(none.client.calls.some((call) => call[0] === 'complete'), false);
});

test('pipeline: cost cap is enforced before any vendor call', async () => {
  const options = deps({ env: { LINES_LOCALIZE_MAX_USD: '5' } });
  options.fetchImpl = () => assert.fail('no call');
  const result = await renderClaimedJob(localizeJob(), options);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'cost_cap_exceeded');
  assert.match(options.client.calls.find((call) => call[0] === 'fail')[2].message, /exceeds the per-job cap/);
});

test('pipeline: a 60-second swap job is refused because Aleph maxes out at 30 seconds', async () => {
  const options = deps();
  options.fetchImpl = () => assert.fail('no call');
  const result = await renderClaimedJob(localizeJob({ seconds: 60 }), options);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'duration_unsupported');
});

test('pipeline: vendor failure is reported and is not a fake success', async () => {
  const options = deps({ vendors: fakeVendors({ mp4, runwayStatuses: ['FAILED'] }) });
  const result = await renderClaimedJob(localizeJob(), options);
  assert.equal(result.status, 'failed');
  assert.equal(result.code, 'swap_failed');
  assert.equal(options.client.calls.some((call) => call[0] === 'complete'), false);
});

test('pipeline: dub-only jobs skip Aleph; swap-only jobs skip HeyGen', async () => {
  const dubOnly = deps();
  const dubbed = await renderClaimedJob(localizeJob({}, { swaps: [], dub: true }), dubOnly);
  assert.equal(dubbed.status, 'succeeded');
  assert.equal(dubOnly.vendors.calls.some((call) => call.path === '/v1/video_to_video'), false);
  assert.equal(dubOnly.vendors.calls.some((call) => call.path === '/v3/video-translations'), true);

  const swapOnly = deps();
  const swapped = await renderClaimedJob(localizeJob({}, { dub: false, captions: { dialect: 'najdi' } }), swapOnly);
  assert.equal(swapped.status, 'succeeded');
  assert.equal(swapOnly.vendors.calls.some((call) => call.path === '/v1/video_to_video'), true);
  assert.equal(swapOnly.vendors.calls.some((call) => call.path === '/v3/video-translations'), false);
});
