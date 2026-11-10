import assert from 'node:assert/strict';
import test from 'node:test';
import { APP_TOKEN, createJob, createTestApp, jobBody } from './helpers.js';

const blocked = [
  'http://hooks.example/callback',
  'https://127.0.0.1/callback',
  'https://localhost/callback',
  'https://169.254.169.254/latest/meta-data',
  'https://10.1.2.3/callback',
  'https://192.168.1.9/callback',
  'https://user:pass@hooks.example/callback',
  'https://[::1]/callback',
  'https://[fe80::1]/callback',
  'https://rebind.example/callback',
];

test('callbackUrl rejects non-https and private or loopback targets', async () => {
  const ctx = await createTestApp({
    webhookLookup: async (host) => {
      if (host === 'rebind.example') return ['10.0.0.8'];
      if (host === 'hooks.example') return ['8.8.8.8'];
      return ['8.8.8.8'];
    },
  });
  try {
    for (const [index, callbackUrl] of blocked.entries()) {
      const response = await createJob(ctx.app, APP_TOKEN, jobBody({ callbackUrl }), `idem-ssrf-${index}-ok`);
      assert.equal(response.status, 422, callbackUrl);
      assert.equal(response.json.error.code, 'ssrf_blocked', callbackUrl);
    }
    const allowed = await createJob(
      ctx.app,
      APP_TOKEN,
      jobBody({ callbackUrl: 'https://hooks.example/api/app/studio/render-callback' }),
      'idem-ssrf-public01',
    );
    assert.equal(allowed.status, 202);
  } finally {
    await ctx.close();
  }
});
