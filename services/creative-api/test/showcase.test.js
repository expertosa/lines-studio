import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { setWorkerEngines } from '../src/keys.js';
import { openStore } from '../src/store.js';
import { APP_TOKEN, WORKER_TOKEN, api, createJob, createTestApp, jobBody } from './helpers.js';

const SHOWCASE_TOKEN = 'test-worker-token-showcase-mac-fff';
const IMAGE = 'https://lines.studio/work/mashhad.webp';
const ARTIFACT = 'https://api.lines.studio/v1/jobs/11111111-1111-4111-8111-111111111111/artifacts/22222222-2222-4222-8222-222222222222?exp=1800000000&sig=abcdef0123456789abcdef0123456789';

function showcaseBody(extra = {}) {
  return {
    reference: 'showcase-1',
    title: 'مشهد',
    style: 'showcase',
    format: '9:16',
    language: 'ar',
    seconds: 8,
    imageUrl: IMAGE,
    ...extra,
  };
}

test('existing promo jobs stay valid and default subtitles off', async () => {
  const ctx = await createTestApp();
  try {
    const created = await createJob(ctx.app, APP_TOKEN, jobBody(), 'idem-promo-flags');
    assert.equal(created.status, 202, created.text);
    const replay = await createJob(ctx.app, APP_TOKEN, jobBody({ subtitles: false, voiceover: true }), 'idem-promo-flags');
    assert.equal(replay.status, 202);
    assert.equal(replay.json.id, created.json.id);
    assert.equal(replay.headers.get('idempotency-replayed'), 'true');
    const changed = await createJob(ctx.app, APP_TOKEN, jobBody({ subtitles: true }), 'idem-promo-flags');
    assert.equal(changed.status, 409);

    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.json.job.style, 'promo');
    assert.equal(claim.json.job.engine, 'moneyprinter');
    assert.equal(claim.json.job.subtitles, false);
    assert.equal(claim.json.job.voiceover, true);
    assert.equal(claim.json.job.imageUrl, null);
    assert.equal(claim.json.job.voice, 'ar-SA-HamedNeural');

    const muted = await createJob(ctx.app, APP_TOKEN, jobBody({
      reference: 'muted-1',
      voiceover: false,
      subtitles: true,
    }), 'idem-promo-muted');
    assert.equal(muted.status, 202, muted.text);
    const viewed = await api(ctx.app, 'GET', `/v1/jobs/${muted.json.id}`, { token: APP_TOKEN });
    assert.equal(viewed.json.subtitles, true);
    assert.equal(viewed.json.voiceover, false);
    assert.equal(viewed.json.engine, 'moneyprinter');
  } finally {
    await ctx.close();
  }
});

test('showcase is a short silent vertical clip from an allowlisted image', async () => {
  const ctx = await createTestApp({
    workerKeys: [
      { id: 'mac-mini', token: WORKER_TOKEN, engines: ['moneyprinter'] },
      { id: 'mac-showcase', token: SHOWCASE_TOKEN, engines: ['showcase'] },
    ],
  });
  try {
    const styles = await api(ctx.app, 'GET', '/v1/styles', { token: APP_TOKEN });
    const showcase = styles.json.styles.find((style) => style.id === 'showcase');
    const promo = styles.json.styles.find((style) => style.id === 'promo');
    assert.equal(showcase.engine, 'showcase');
    assert.equal(showcase.requiresImage, true);
    assert.deepEqual(showcase.formats, ['9:16']);
    assert.deepEqual(showcase.seconds, [6, 7, 8, 9, 10]);
    assert.deepEqual(promo.seconds, [15, 30, 60]);
    assert.equal(promo.requiresImage, false);

    const quote = await api(ctx.app, 'GET', '/v1/quote?seconds=8&style=showcase', { token: APP_TOKEN });
    assert.equal(quote.status, 200, quote.text);
    assert.equal(quote.json.engine, 'showcase');
    assert.equal(quote.json.seconds, 8);
    const stockQuote = await api(ctx.app, 'GET', '/v1/quote?seconds=8&style=promo', { token: APP_TOKEN });
    assert.equal(stockQuote.status, 422);

    const created = await createJob(ctx.app, APP_TOKEN, showcaseBody(), 'idem-showcase-01');
    assert.equal(created.status, 202, created.text);
    const job = await api(ctx.app, 'GET', `/v1/jobs/${created.json.id}`, { token: APP_TOKEN });
    assert.equal(job.json.subtitles, false);
    assert.equal(job.json.voiceover, false);
    assert.equal(job.json.imageUrl, IMAGE);
    assert.equal(job.json.engine, 'showcase');

    const moneyprinter = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(moneyprinter.json.job, null);
    const claimed = await api(ctx.app, 'POST', '/v1/worker/claim', { token: SHOWCASE_TOKEN, body: {} });
    assert.equal(claimed.json.job.id, created.json.id);
    assert.equal(claimed.json.job.width, 720);
    assert.equal(claimed.json.job.height, 1280);
    assert.equal(claimed.json.job.seconds, 8);
    assert.equal(claimed.json.job.subtitles, false);
    assert.equal(claimed.json.job.voiceover, false);
    assert.equal(claimed.json.job.imageUrl, IMAGE);
    assert.equal(claimed.json.job.prompt, null);

    const health = await api(ctx.app, 'GET', '/v1/health');
    assert.equal(health.json.engines.showcase.ready, true);
    assert.equal(health.json.engines.showcase.paidCalls, false);
    assert.equal(health.json.engines.moneyprinter.ready, true);

    const artifact = await createJob(ctx.app, APP_TOKEN, showcaseBody({
      reference: 'showcase-artifact',
      imageUrl: ARTIFACT,
      seconds: 6,
    }), 'idem-showcase-art');
    assert.equal(artifact.status, 202, artifact.text);
  } finally {
    await ctx.close();
  }
});

test('showcase rejects subtitles, voiceover, other shapes, and off-list image URLs', async () => {
  const ctx = await createTestApp();
  try {
    const cases = [
      [{ imageUrl: 'http://169.254.169.254/latest/meta-data' }, 'ssrf_blocked'],
      [{ imageUrl: 'https://evil.example/work/mashhad.webp' }, 'ssrf_blocked'],
      [{ imageUrl: 'https://lines.studio/admin' }, 'ssrf_blocked'],
      [{ imageUrl: 'https://user:pass@lines.studio/work/mashhad.webp' }, 'ssrf_blocked'],
      [{ imageUrl: 'https://lines.studio/work/mashhad.webp?x=1' }, 'ssrf_blocked'],
      [{ subtitles: true }, 'validation_error'],
      [{ voiceover: true }, 'validation_error'],
      [{ seconds: 15 }, 'validation_error'],
      [{ format: '16:9' }, 'validation_error'],
      [{ voice: 'ar-SA-HamedNeural' }, 'validation_error'],
    ];
    for (const [index, [extra, code]] of cases.entries()) {
      const response = await createJob(ctx.app, APP_TOKEN, showcaseBody(extra), `idem-showcase-bad-${index}`);
      assert.equal(response.status, 422, `${JSON.stringify(extra)} ${response.text}`);
      assert.equal(response.json.error.code, code, JSON.stringify(extra));
    }
    const missing = await createJob(ctx.app, APP_TOKEN, showcaseBody({ imageUrl: undefined }), 'idem-showcase-miss');
    assert.equal(missing.status, 422);
    const promoImage = await createJob(ctx.app, APP_TOKEN, jobBody({ imageUrl: IMAGE }), 'idem-promo-image');
    assert.equal(promoImage.status, 422);
    assert.equal(promoImage.json.error.details.some((item) => item.path === 'imageUrl'), true);
  } finally {
    await ctx.close();
  }
});

test('set-engines adds showcase without replacing the worker token', async () => {
  const ctx = await createTestApp();
  try {
    const created = await createJob(ctx.app, APP_TOKEN, showcaseBody(), 'idem-showcase-key');
    assert.equal(created.status, 202, created.text);
    const before = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(before.json.job, null);
    const updated = setWorkerEngines(ctx.app.store, 'mac-mini', ['moneyprinter', 'showcase']);
    assert.deepEqual(updated.engines, ['moneyprinter', 'showcase']);
    const claim = await api(ctx.app, 'POST', '/v1/worker/claim', { token: WORKER_TOKEN, body: {} });
    assert.equal(claim.status, 200, claim.text);
    assert.equal(claim.json.job.id, created.json.id);
    assert.equal(claim.json.job.engine, 'showcase');
  } finally {
    await ctx.close();
  }
});

test('an existing jobs table gains the subtitle and image columns', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-migrate-'));
  try {
    const db = new DatabaseSync(path.join(dir, 'creative.sqlite'));
    db.exec(`
      CREATE TABLE jobs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        end_user_id TEXT,
        reference TEXT NOT NULL,
        title TEXT NOT NULL,
        prompt TEXT,
        script_json TEXT,
        style TEXT NOT NULL,
        format TEXT NOT NULL,
        language TEXT NOT NULL,
        seconds INTEGER NOT NULL,
        voice TEXT NOT NULL,
        callback_url TEXT,
        metadata_json TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        status TEXT NOT NULL,
        engine TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL,
        cancel_requested INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        error_message TEXT,
        lease_owner TEXT,
        lease_expires_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER,
        heartbeat_at INTEGER,
        deadline_at INTEGER NOT NULL,
        artifact_ttl_ms INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX jobs_idempotency ON jobs(tenant_id, idempotency_key);
      CREATE INDEX jobs_tenant_created ON jobs(tenant_id, created_at DESC, id DESC);
      CREATE INDEX jobs_status ON jobs(status, created_at);
    `);
    db.prepare(`
      INSERT INTO jobs (
        id, tenant_id, reference, title, prompt, style, format, language, seconds, voice,
        metadata_json, request_hash, idempotency_key, status, engine, width, height,
        max_attempts, created_at, updated_at, deadline_at, artifact_ttl_ms
      ) VALUES (
        'job-old', 'experto-web', 'old-1', 'عرض', 'نص', 'promo', '9:16', 'ar', 15, 'ar-SA-HamedNeural',
        '{}', 'hash', 'idem-old', 'queued', 'moneyprinter', 1080, 1920,
        2, 1, 1, 9, 1000
      )
    `).run();
    db.close();
    const store = openStore(dir);
    const job = store.readJob('job-old');
    store.close();
    assert.equal(job.subtitles, false);
    assert.equal(job.voiceover, true);
    assert.equal(job.imageUrl, null);
    assert.equal(job.style, 'promo');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
