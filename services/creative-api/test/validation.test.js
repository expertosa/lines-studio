import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCredentials } from '../src/auth.js';
import { cleanProcessEnv } from '../src/render/local-ffmpeg.js';
import { contrastRatio } from '../src/validate.js';
import { api, gateway, holdProvider, startApp, videoBrief } from './helpers.js';

async function post(ctx, body, extra = {}) {
  return api(ctx.base, {
    method: 'POST',
    path: '/v1/creative-jobs',
    body,
    idempotency: extra.idempotency || 'idem-valid-001',
    ...gateway(),
    ...extra,
  });
}

test('publish, remote media, and out-of-range fields are rejected before a job exists', async (t) => {
  const ctx = await startApp({ provider: holdProvider() });
  t.after(() => ctx.close());

  const publish = await post(ctx, { ...videoBrief(), publish: true, adAccountId: 'act_1', accessToken: 'should-not-stick' });
  assert.equal(publish.status, 422);
  assert.equal(publish.json.error.code, 'publish_not_supported');
  assert.equal(JSON.stringify(publish.json).includes('should-not-stick'), false);

  const url = await post(ctx, videoBrief({ headline: 'See https://evil.example/a.mp4' }), { idempotency: 'idem-valid-002' });
  assert.equal(url.status, 422);
  assert.equal(url.json.error.details.some((item) => item.code === 'url_rejected'), true);

  const media = await post(ctx, { ...videoBrief(), imageUrl: 'https://evil.example/a.png' }, { idempotency: 'idem-valid-003' });
  assert.equal(media.status, 422);
  assert.equal(media.json.error.code, 'publish_not_supported');

  const duration = await post(ctx, videoBrief({ durationMs: 999999 }), { idempotency: 'idem-valid-004' });
  assert.equal(duration.status, 422);
  assert.equal(duration.json.error.details.some((item) => item.path === 'durationMs'), true);

  const preset = await post(ctx, videoBrief({ width: 99999, height: 1 }), { idempotency: 'idem-valid-005' });
  assert.equal(preset.status, 422);

  const contrast = await post(ctx, videoBrief({
    backgroundColor: '#000000',
    foregroundColor: '#111111',
  }), { idempotency: 'idem-valid-006' });
  assert.equal(contrast.status, 422);
  assert.equal(contrast.json.error.details.some((item) => item.code === 'low_contrast'), true);

  const bidi = await post(ctx, videoBrief({ headline: 'Hello\u202Esecret' }), { idempotency: 'idem-valid-007' });
  assert.equal(bidi.status, 422);

  const huge = await post(ctx, videoBrief({ headline: 'A'.repeat(81) }), { idempotency: 'idem-valid-008' });
  assert.equal(huge.status, 422);

  const list = await api(ctx.base, { path: '/v1/creative-jobs', ...gateway() });
  assert.equal(list.status, 200);
  assert.equal(list.json.jobs.length, 0);
});

test('ad creative rejects a duration and video requires one', async (t) => {
  const ctx = await startApp({ provider: holdProvider() });
  t.after(() => ctx.close());
  const still = await post(ctx, {
    ...videoBrief(),
    kind: 'ad_creative',
    durationMs: 2000,
  });
  assert.equal(still.status, 422);
  const ok = await post(ctx, {
    kind: 'ad_creative',
    locale: 'en',
    headline: 'Spring offer',
    brandName: 'Lines Studio',
    width: 1080,
    height: 1080,
    backgroundColor: '#102A43',
    foregroundColor: '#FFFFFF',
  }, { idempotency: 'idem-valid-010' });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.kind, 'ad_creative');
  assert.equal(ok.json.publish.performed, false);
  assert.equal(ok.json.billing.extraGenerationFee, false);
  assert.equal(ok.json.billing.creditDeduction, false);
  assert.equal(ok.json.billing.paidProviderRequest, false);
  assert.equal(ok.json.paidCalls, false);
});

test('malformed json, wrong content type, and oversized bodies fail closed', async (t) => {
  const ctx = await startApp({ provider: holdProvider() });
  t.after(() => ctx.close());
  const type = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', rawBody: 'hello', contentType: 'text/plain',
    idempotency: 'idem-valid-011', ...gateway(),
  });
  assert.equal(type.status, 415);
  const json = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', rawBody: '{', contentType: 'application/json',
    idempotency: 'idem-valid-012', ...gateway(),
  });
  assert.equal(json.status, 400);
  const missingKey = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), ...gateway(),
  });
  assert.equal(missingKey.status, 400);
  assert.equal(missingKey.json.error.code, 'invalid_idempotency_key');
  const oversized = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', rawBody: 'x'.repeat(9000), contentType: 'application/json',
    idempotency: 'idem-valid-013', ...gateway(),
  });
  assert.equal(oversized.status, 413);
});

test('credential parser and process env stay strict', () => {
  assert.throws(() => parseCredentials(JSON.stringify([
    { id: 'experto-web', token: 'short', tenants: ['*'], scopes: ['jobs:read'] },
  ])));
  assert.throws(() => parseCredentials('not-json'));
  const previous = process.env.LINES_CREATIVE_CREDENTIALS;
  process.env.LINES_CREATIVE_CREDENTIALS = 'super-secret-token-value';
  const env = cleanProcessEnv();
  assert.equal(env.LINES_CREATIVE_CREDENTIALS, undefined);
  assert.equal(JSON.stringify(env).includes('super-secret-token-value'), false);
  if (previous === undefined) delete process.env.LINES_CREATIVE_CREDENTIALS;
  else process.env.LINES_CREATIVE_CREDENTIALS = previous;
  assert.ok(contrastRatio('#102A43', '#F7F3EA') >= 3);
  assert.ok(contrastRatio('#000000', '#111111') < 3);
});
