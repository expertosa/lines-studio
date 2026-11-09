import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { api, gateway, startApp, TOKENS, videoBrief, waitTerminal } from './helpers.js';

function blackProvider() {
  return {
    name: 'fixture-black',
    ready: true,
    generative: false,
    paidCalls: false,
    async render(_job, ctx) {
      const out = `${ctx.workDir}/black.mp4`;
      const result = spawnSync('ffmpeg', [
        '-y', '-hide_banner', '-loglevel', 'error',
        '-f', 'lavfi', '-i', 'color=c=black:s=640x360:d=2:r=30',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
        out,
      ], { timeout: 15000 });
      if (result.status !== 0) throw new Error('black fixture encode failed');
      return { filePath: out, mime: 'video/mp4' };
    },
  };
}

test('a black fixture video is rejected and is not a fulfilled order', async (t) => {
  const ctx = await startApp({ provider: blackProvider(), worker: true, pollMs: 15 });
  t.after(() => ctx.close());
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-black-001', ...gateway(),
  });
  assert.equal(created.status, 201);
  const done = await waitTerminal(ctx, created.json.id, gateway());
  assert.equal(done.json.status, 'failed');
  assert.equal(done.json.error.code, 'artifact_rejected');
  assert.equal(done.json.artifacts.length, 0);
  assert.equal(done.json.provider, 'fixture-black');
  assert.notEqual(done.json.status, 'succeeded');
  const download = await api(ctx.base, {
    path: `/v1/creative-jobs/${created.json.id}/artifacts/00000000-0000-4000-8000-000000000001`,
    ...gateway(),
  });
  assert.equal(download.status, 404);
});

test('artifact routes reject traversal and do not follow a caller-supplied URL', async (t) => {
  const ctx = await startApp({ providerName: 'disabled' });
  t.after(() => ctx.close());
  const weird = await api(ctx.base, {
    path: '/v1/creative-jobs/11111111-1111-4111-8111-111111111111/artifacts/..%2F..%2Fetc%2Fpasswd',
    ...gateway(),
  });
  assert.equal(weird.status, 404);
  const query = await api(ctx.base, {
    path: '/v1/creative-jobs/11111111-1111-4111-8111-111111111111/artifacts/22222222-2222-4222-8222-222222222222?url=https://evil.example/a.mp4',
    ...gateway(),
  });
  assert.equal(query.status, 404);
  assert.equal(query.headers.get('location'), null);
});

function assertRendered(job, mime) {
  assert.equal(job.status, 'succeeded');
  assert.equal(job.artifacts.length, 1);
  const artifact = job.artifacts[0];
  assert.equal(artifact.classification, 'rendered');
  assert.equal(artifact.uniformFrame, false);
  assert.equal(artifact.mime, mime);
  assert.ok(artifact.byteSize > 0);
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  assert.ok(artifact.lumaStdev >= 8);
  assert.equal(job.billing.payer, 'experto');
  assert.equal(job.billing.includedInServicePrice, true);
  assert.equal(job.billing.extraGenerationFee, false);
  assert.equal(job.billing.creditDeduction, false);
  assert.equal(job.billing.paidProviderRequest, false);
  assert.equal(job.publish.performed, false);
  assert.equal(job.publish.supported, false);
  assert.equal(job.generative, false);
  assert.equal(job.paidCalls, false);
  assert.equal(job.provider, 'local-ffmpeg');
  return artifact;
}

test('local ffmpeg renders a real video and still, and artifacts survive restart', async (t) => {
  const ctx = await startApp({ worker: true, pollMs: 20, limits: { artifactTtlMs: 60_000 } });
  const english = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-real-0001', ...gateway(),
  });
  assert.equal(english.status, 201);
  const video = await waitTerminal(ctx, english.json.id, gateway(), 25000);
  const videoArtifact = assertRendered(video.json, 'video/mp4');
  assert.equal(videoArtifact.width, 640);
  assert.equal(videoArtifact.height, 360);
  assert.ok(Math.abs(videoArtifact.durationMs - 2000) <= 400);

  const file = await api(ctx.base, {
    path: videoArtifact.downloadPath, token: TOKENS.gateway, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'video/mp4');
  assert.equal(file.headers.get('x-artifact-classification'), 'rendered');
  assert.equal(file.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(file.headers.get('x-content-sha256'), videoArtifact.sha256);
  assert.equal(file.headers.get('content-disposition'), `attachment; filename="creative-${videoArtifact.id}.mp4"`);
  assert.equal(file.buf.subarray(4, 8).toString('ascii'), 'ftyp');
  assert.equal(createHash('sha256').update(file.buf).digest('hex'), videoArtifact.sha256);
  assert.equal(file.buf.length, videoArtifact.byteSize);

  const otherCustomer = await api(ctx.base, {
    path: videoArtifact.downloadPath, token: TOKENS.gateway, tenant: 'tenant-a', customer: 'cust-b',
  });
  assert.equal(otherCustomer.status, 404);
  const otherTenant = await api(ctx.base, {
    path: videoArtifact.downloadPath, token: TOKENS.tenantB, tenant: 'tenant-b', customer: 'cust-a',
  });
  assert.equal(otherTenant.status, 404);
  const writeOnly = await api(ctx.base, {
    path: videoArtifact.downloadPath, token: TOKENS.writeOnly, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(writeOnly.status, 403);
  const linked = await api(ctx.base, {
    path: `${videoArtifact.downloadPath}?url=https://evil.example/steal.mp4`,
    token: TOKENS.gateway, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(linked.status, 200);
  assert.equal(linked.headers.get('location'), null);
  assert.equal(linked.buf.equals(file.buf), true);

  const arabic = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', idempotency: 'idem-real-0002', ...gateway(),
    body: videoBrief({
      locale: 'ar',
      headline: 'إعلان افتتاح الفرع',
      subline: 'احجز معاينة مجانية',
      callToAction: 'تواصل معنا',
      brandName: 'خطوط ستوديو',
    }),
  });
  const arabicDone = await waitTerminal(ctx, arabic.json.id, gateway(), 25000);
  assertRendered(arabicDone.json, 'video/mp4');

  const still = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', idempotency: 'idem-real-0003', ...gateway(),
    body: {
      kind: 'ad_creative',
      locale: 'en',
      headline: 'Spring offer',
      subline: 'This week only',
      callToAction: 'Book now',
      brandName: 'Lines Studio',
      width: 640,
      height: 360,
      backgroundColor: '#102A43',
      foregroundColor: '#F7F3EA',
    },
  });
  const stillDone = await waitTerminal(ctx, still.json.id, gateway(), 25000);
  const stillArtifact = assertRendered(stillDone.json, 'image/png');
  const png = await api(ctx.base, { path: stillArtifact.downloadPath, ...gateway() });
  assert.equal(png.headers.get('content-type'), 'image/png');
  assert.equal(png.buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);

  const finished = await api(ctx.base, {
    method: 'POST', path: `/v1/creative-jobs/${english.json.id}/cancel`, ...gateway(),
  });
  assert.equal(finished.status, 409);
  assert.equal(finished.json.error.code, 'not_cancellable');

  await ctx.close();
  const reopened = await startApp({
    dataDir: ctx.dataDir,
    worker: false,
    limits: { artifactTtlMs: 60_000 },
  });
  t.after(() => reopened.close());
  const again = await api(reopened.base, { path: videoArtifact.downloadPath, ...gateway() });
  assert.equal(again.status, 200);
  assert.equal(again.buf.equals(file.buf), true);

  reopened.nowBox.t += 120_000;
  const expired = await api(reopened.base, { path: videoArtifact.downloadPath, ...gateway() });
  assert.equal(expired.status, 410);
  assert.equal(expired.json.error.code, 'expired');
  const gone = await api(reopened.base, { method: 'GET', path: `/v1/creative-jobs/${english.json.id}`, ...gateway() });
  assert.equal(gone.json.artifacts.length, 0);
  assert.equal(gone.json.status, 'succeeded');
});
