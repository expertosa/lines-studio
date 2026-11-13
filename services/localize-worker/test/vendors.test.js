import assert from 'node:assert/strict';
import test from 'node:test';
import { HEYGEN_SAUDI_LANGUAGE, runHeygenPrecision } from '../src/heygen_translate.js';
import { ALEPH_MODEL, RUNWAY_VERSION, runAlephSwap } from '../src/runway_aleph.js';
import { fakeVendors } from './helpers.js';

test('Runway Aleph request shape: aleph2, version header, bearer auth, documented path', async () => {
  const { fetchImpl, calls } = fakeVendors();
  const result = await runAlephSwap({
    apiKey: 'k-runway',
    videoUri: 'https://cdn.example.com/ads/coffee-global.mp4',
    promptText: 'Change the background to Riyadh Boulevard. Keep the people, products, framing and motion exactly as they are.',
    keyframes: [{ uri: 'https://cdn.example.com/products/qahwa.png', seconds: 0 }],
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.outputUrl, 'https://dnznrvs05pmza.cloudfront.net/aleph-out.mp4');
  assert.equal(result.taskId, '11111111-1111-1111-1111-111111111111');
  const submit = calls[0];
  assert.equal(submit.host, 'api.dev.runwayml.com');
  assert.equal(submit.path, '/v1/video_to_video');
  assert.equal(submit.method, 'POST');
  assert.equal(submit.headers.authorization, 'Bearer k-runway');
  assert.equal(submit.headers['x-runway-version'], RUNWAY_VERSION);
  assert.deepEqual(JSON.parse(submit.body), {
    model: ALEPH_MODEL,
    videoUri: 'https://cdn.example.com/ads/coffee-global.mp4',
    promptText: 'Change the background to Riyadh Boulevard. Keep the people, products, framing and motion exactly as they are.',
    outputFormat: 'mp4',
    keyframes: [{ uri: 'https://cdn.example.com/products/qahwa.png', seconds: 0 }],
  });
  const poll = calls.find((call) => call.path === '/v1/tasks/11111111-1111-1111-1111-111111111111');
  assert.ok(poll);
  assert.equal(poll.headers['x-runway-version'], RUNWAY_VERSION);
  for (const call of calls) {
    if (call.headers.authorization) assert.equal(call.host, 'api.dev.runwayml.com');
  }
});

test('Runway polls PENDING/THROTTLED/RUNNING then SUCCEEDED; FAILED is not retried', async () => {
  const ok = fakeVendors({ runwayStatuses: ['PENDING', 'THROTTLED', 'RUNNING', 'SUCCEEDED'] });
  let beats = 0;
  const result = await runAlephSwap({
    apiKey: 'k', videoUri: 'https://cdn.example.com/a.mp4', promptText: 'Swap the bag.',
    fetchImpl: ok.fetchImpl, sleep: async () => {}, heartbeat: async () => { beats += 1; },
  });
  assert.equal(result.outputUrl.startsWith('https://'), true);
  assert.equal(beats, 3);
  await assert.rejects(
    runAlephSwap({
      apiKey: 'k', videoUri: 'https://cdn.example.com/a.mp4', promptText: 'Swap the bag.',
      fetchImpl: fakeVendors({ runwayStatuses: ['RUNNING', 'FAILED'] }).fetchImpl,
      sleep: async () => {},
    }),
    (error) => error.code === 'swap_failed' && error.retry === false && /moderation/.test(error.message),
  );
});

test('Runway missing key is engine_not_configured and makes no HTTP call', async () => {
  await assert.rejects(
    runAlephSwap({ apiKey: '', videoUri: 'https://cdn.example.com/a.mp4', promptText: 'x', fetchImpl: () => assert.fail('no call'), sleep: async () => {} }),
    (error) => error.code === 'engine_not_configured' && error.retry === false,
  );
});

test('HeyGen Precision request shape: v3 translations, mode precision, Arabic (Saudi Arabia)', async () => {
  const { fetchImpl, calls } = fakeVendors();
  const result = await runHeygenPrecision({
    apiKey: 'k-heygen',
    videoUrl: 'https://dnznrvs05pmza.cloudfront.net/aleph-out.mp4',
    title: 'إعلان القهوة بنسخة سعودية',
    fetchImpl,
    sleep: async () => {},
  });
  assert.equal(result.videoUrl, 'https://resource.heygen.ai/video/translated.mp4');
  assert.equal(result.translationId, 'vt-1');
  assert.equal(HEYGEN_SAUDI_LANGUAGE, 'Arabic (Saudi Arabia)');
  const submit = calls[0];
  assert.equal(submit.host, 'api.heygen.com');
  assert.equal(submit.path, '/v3/video-translations');
  assert.equal(submit.headers['x-api-key'], 'k-heygen');
  assert.deepEqual(JSON.parse(submit.body), {
    video: { type: 'url', url: 'https://dnznrvs05pmza.cloudfront.net/aleph-out.mp4' },
    output_languages: ['Arabic (Saudi Arabia)'],
    mode: 'precision',
    title: 'إعلان القهوة بنسخة سعودية',
    keep_the_same_format: true,
    enable_dynamic_duration: false,
  });
  const poll = calls.find((call) => call.path === '/v3/video-translations/vt-1');
  assert.ok(poll);
  for (const call of calls) {
    if (call.headers['x-api-key']) assert.equal(call.host, 'api.heygen.com');
  }
});

test('HeyGen polls pending/running then completed; failed is not retried', async () => {
  let beats = 0;
  const ok = fakeVendors({ heygenStatuses: ['pending', 'running', 'completed'] });
  const result = await runHeygenPrecision({
    apiKey: 'k', videoUrl: 'https://cdn.example.com/a.mp4',
    fetchImpl: ok.fetchImpl, sleep: async () => {}, heartbeat: async () => { beats += 1; },
  });
  assert.equal(result.videoUrl.startsWith('https://'), true);
  assert.equal(beats, 2);
  await assert.rejects(
    runHeygenPrecision({
      apiKey: 'k', videoUrl: 'https://cdn.example.com/a.mp4',
      fetchImpl: fakeVendors({ heygenStatuses: ['running', 'failed'] }).fetchImpl,
      sleep: async () => {},
    }),
    (error) => error.code === 'translate_failed' && error.retry === false && /audio extraction/.test(error.message),
  );
});

test('HeyGen missing key is engine_not_configured and makes no HTTP call', async () => {
  await assert.rejects(
    runHeygenPrecision({ apiKey: '', videoUrl: 'https://cdn.example.com/a.mp4', fetchImpl: () => assert.fail('no call'), sleep: async () => {} }),
    (error) => error.code === 'engine_not_configured' && error.retry === false,
  );
});
