import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { webhookSignature } from '../src/sign.js';
import { APP_TOKEN, WEBHOOK_SECRET, WORKER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

test('template engine renders a job and a promo job stays queued for the Mac', async () => {
  let clock = Date.parse('2026-11-10T12:00:00.000Z');
  const ctx = await createTestApp({
    now: () => clock,
    limits: { artifactTtlMs: 60_000, signedUrlTtlMs: 30_000, templateTimeoutMs: 60_000 },
  });
  try {
    const promo = await createJob(ctx.app, APP_TOKEN, jobBody({ reference: 'promo-1' }), 'idem-e2e-promo1');
    assert.equal(promo.status, 202);
    const created = await createJob(ctx.app, APP_TOKEN, jobBody({
      reference: 'template-1',
      style: 'template',
      title: 'عرض من اكسبرتو',
      prompt: 'فيديو قصير من اكسبرتو',
      callbackUrl: 'https://hooks.example/api/app/studio/render-callback',
    }), 'idem-e2e-template');
    assert.equal(created.status, 202);
    assert.equal(created.json.status, 'queued');
    await ctx.app.tick();
    const job = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(job.status, 200);
    assert.equal(job.json.status, 'succeeded');
    assert.equal(job.json.engine, 'template');
    assert.equal(job.json.artifacts.length, 1);
    assert.equal(job.json.artifacts[0].mime, 'video/mp4');
    const waiting = await api(ctx.app, 'GET', `/v1/jobs/${promo.json.id}`, { token: APP_TOKEN });
    assert.equal(waiting.json.status, 'queued');
    assert.equal(waiting.json.engine, 'moneyprinter');
    const artifact = job.json.artifacts[0];
    const signed = await fetch(ctx.app.url + artifact.signedUrl, { headers: { range: 'bytes=0-15' } });
    assert.equal(signed.status, 206);
    const prefix = Buffer.from(await signed.arrayBuffer());
    assert.equal(prefix.length, 16);
    const authed = await fetch(ctx.app.url + artifact.downloadPath, {
      headers: { authorization: `Bearer ${APP_TOKEN}`, range: 'bytes=0-11' },
    });
    assert.equal(authed.status, 206);
    assert.equal(authed.headers.get('content-type'), 'video/mp4');
    assert.equal(authed.headers.get('x-content-sha256'), artifact.sha256);
    assert.equal(ctx.calls.length, 1);
    const call = ctx.calls[0];
    assert.equal(call.headers['x-lines-signature'], webhookSignature(WEBHOOK_SECRET, call.headers['x-lines-timestamp'], call.body));
    assert.equal(JSON.parse(call.body).event, 'job.succeeded');
    clock += 45_000;
    const stale = await fetch(ctx.app.url + artifact.signedUrl);
    assert.equal(stale.status, 401);
    const still = await fetch(ctx.app.url + artifact.downloadPath, {
      headers: { authorization: `Bearer ${APP_TOKEN}` },
    });
    assert.equal(still.status, 200);
    clock += 20_000;
    await ctx.app.tick();
    const expired = await fetch(ctx.app.url + artifact.downloadPath, {
      headers: { authorization: `Bearer ${APP_TOKEN}` },
    });
    assert.equal(expired.status, 410);
  } finally {
    await ctx.close();
  }
});

test('a worker uploads an MP4 and completes the leased job', async () => {
  const ctx = await createTestApp();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-mp4-'));
  try {
    const video = path.join(dir, 'clip.mp4');
    const thumb = path.join(dir, 'thumb.png');
    ffmpeg([
      '-f', 'lavfi', '-i', 'color=c=0x102A43:s=160x120:d=1:r=8,drawbox=w=80:h=40:color=0xE8C872:t=fill',
      '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', video,
    ]);
    ffmpeg(['-i', video, '-frames:v', '1', thumb]);
    const created = await createJob(ctx.app, APP_TOKEN, jobBody({ reference: 'upload-1' }), 'idem-upload-001');
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.json.job.id, created.json.id);
    const boundary = '----lines-boundary';
    const body = Buffer.concat([
      part(boundary, 'video', 'video/mp4', fs.readFileSync(video)),
      part(boundary, 'thumbnail', 'image/png', fs.readFileSync(thumb)),
      Buffer.from(`--${boundary}--\r\n`),
    ]);
    const uploaded = await api(ctx.app, 'POST', `/v1/worker/jobs/${created.json.id}/artifacts`, {
      token: WORKER_TOKEN,
      raw: body,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    });
    assert.equal(uploaded.status, 201, uploaded.text);
    assert.equal(uploaded.json.artifacts.length, 2);
    const done = await api(ctx.app, 'POST', `/v1/worker/jobs/${created.json.id}/complete`, { token: WORKER_TOKEN, body: {} });
    assert.equal(done.status, 200);
    assert.equal(done.json.status, 'succeeded');
    const job = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(job.json.artifacts.some((item) => item.role === 'video'), true);
    const other = await api(ctx.app, 'POST', `/v1/worker/jobs/${created.json.id}/heartbeat`, { token: WORKER_TOKEN, body: {} });
    assert.equal(other.status, 409);
  } finally {
    await ctx.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function part(boundary, name, type, data) {
  return Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${name}.bin"\r\nContent-Type: ${type}\r\n\r\n`),
    data,
    Buffer.from('\r\n'),
  ]);
}
