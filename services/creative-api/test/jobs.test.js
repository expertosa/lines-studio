import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../src/app.js';
import { CodedError } from '../src/errors.js';
import {
  api, credentials, gateway, holdProvider, runNode, startApp, TOKENS, videoBrief, waitTerminal,
} from './helpers.js';

test('idempotency replays the same job and conflicts when the body changes', async (t) => {
  const ctx = await startApp({ provider: holdProvider() });
  t.after(() => ctx.close());
  const first = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-same-0001', ...gateway(),
  });
  assert.equal(first.status, 201);
  const replay = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief({ backgroundColor: '#102a43' }),
    idempotency: 'idem-same-0001', ...gateway(),
  });
  assert.equal(replay.status, 200);
  assert.equal(replay.headers.get('idempotency-replayed'), 'true');
  assert.equal(replay.json.id, first.json.id);
  const conflict = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief({ headline: 'Different offer' }),
    idempotency: 'idem-same-0001', ...gateway(),
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.json.error.code, 'idempotency_conflict');
});

test('concurrent creates with one key produce one job', async (t) => {
  const ctx = await startApp({ provider: holdProvider() });
  t.after(() => ctx.close());
  const requests = Array.from({ length: 12 }, () => api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-race-0001', ...gateway(),
  }));
  const results = await Promise.all(requests);
  const created = results.filter((item) => item.status === 201);
  const replayed = results.filter((item) => item.status === 200);
  assert.equal(created.length, 1);
  assert.equal(replayed.length, 11);
  const ids = new Set(results.map((item) => item.json.id));
  assert.equal(ids.size, 1);
});

test('hourly limit counts creates and still replays the original key', async (t) => {
  const ctx = await startApp({ provider: holdProvider(), limits: { maxJobsPerHour: 2 } });
  t.after(() => ctx.close());
  const first = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-rate-0001', ...gateway(),
  });
  const second = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-rate-0002', ...gateway(),
  });
  const third = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-rate-0003', ...gateway(),
  });
  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get('retry-after'), '60');
  const replay = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-rate-0001', ...gateway(),
  });
  assert.equal(replay.status, 200);
  ctx.nowBox.t += 2 * 60 * 60 * 1000;
  const later = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-rate-0004', ...gateway(),
  });
  assert.equal(later.status, 201);
});

test('queued jobs can be cancelled, terminal jobs cannot, and deadlines fail with no artifact', async (t) => {
  const ctx = await startApp({ provider: holdProvider(), limits: { deadlineMs: 5000 } });
  t.after(() => ctx.close());
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-cancel-001', ...gateway(),
  });
  const cancelled = await api(ctx.base, {
    method: 'POST', path: `/v1/creative-jobs/${created.json.id}/cancel`, ...gateway(),
  });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.status, 'cancelled');
  assert.equal(cancelled.json.artifacts.length, 0);
  const again = await api(ctx.base, {
    method: 'POST', path: `/v1/creative-jobs/${created.json.id}/cancel`, ...gateway(),
  });
  assert.equal(again.status, 200);
  const other = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-cancel-002', ...gateway(),
  });
  ctx.nowBox.t += 6000;
  await ctx.app.tick();
  const expired = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${other.json.id}`, ...gateway(),
  });
  assert.equal(expired.json.status, 'failed');
  assert.equal(expired.json.error.code, 'deadline_exceeded');
  assert.equal(expired.json.artifacts.length, 0);
});

test('a running job cancels without an artifact and a timeout is terminal', async (t) => {
  const hanging = {
    name: 'hang',
    ready: true,
    generative: false,
    paidCalls: false,
    render(_job, ctx) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10_000);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const code = ctx.signal.reason === 'timeout' ? 'RENDER_TIMEOUT' : 'CANCELLED';
          reject(new CodedError(code, 'stopped'));
        }, { once: true });
      });
    },
  };
  const ctx = await startApp({ provider: hanging, worker: true, pollMs: 15 });
  t.after(() => ctx.close());
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-run-0001', ...gateway(),
  });
  assert.equal(created.status, 201);
  let running = created;
  const started = Date.now();
  while (running.json.status !== 'running') {
    if (Date.now() - started > 3000) break;
    running = await api(ctx.base, { method: 'GET', path: `/v1/creative-jobs/${created.json.id}`, ...gateway() });
  }
  const cancelled = await api(ctx.base, {
    method: 'POST', path: `/v1/creative-jobs/${created.json.id}/cancel`, ...gateway(),
  });
  assert.equal(cancelled.status, 200);
  const done = await waitTerminal(ctx, created.json.id, gateway());
  assert.equal(done.json.status, 'cancelled');
  assert.equal(done.json.artifacts.length, 0);

  const slow = await startApp({
    provider: hanging,
    worker: true,
    pollMs: 15,
    timeoutOverrideMs: 200,
  });
  t.after(() => slow.close());
  const timed = await api(slow.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-time-0001', ...gateway(),
  });
  const failed = await waitTerminal(slow, timed.json.id, gateway());
  assert.equal(failed.json.status, 'failed');
  assert.equal(failed.json.error.code, 'render_timeout');
  assert.equal(failed.json.artifacts.length, 0);
});

test('provider failures and escaped output paths do not fulfill a job', async (t) => {
  const failing = {
    name: 'test-fault',
    ready: true,
    generative: false,
    paidCalls: false,
    async render() {
      throw new CodedError('RENDER_FAILED', 'encoder crashed');
    },
  };
  const ctx = await startApp({ provider: failing, worker: true, pollMs: 15 });
  t.after(() => ctx.close());
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-fail-0001', ...gateway(),
  });
  const failed = await waitTerminal(ctx, created.json.id, gateway());
  assert.equal(failed.json.status, 'failed');
  assert.equal(failed.json.error.code, 'render_failed');
  assert.equal(failed.json.provider, 'test-fault');
  assert.equal(failed.json.artifacts.length, 0);
  assert.equal(JSON.stringify(failed.json).includes('encoder crashed'), false);

  const escape = {
    name: 'escape',
    ready: true,
    generative: false,
    paidCalls: false,
    async render() {
      return { filePath: 'https://evil.example/creative.mp4', mime: 'video/mp4' };
    },
  };
  const escaped = await startApp({ provider: escape, worker: true, pollMs: 15 });
  t.after(() => escaped.close());
  const job = await api(escaped.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-fail-0002', ...gateway(),
  });
  const rejected = await waitTerminal(escaped, job.json.id, gateway());
  assert.equal(rejected.json.status, 'failed');
  assert.equal(rejected.json.error.code, 'artifact_rejected');
  assert.equal(rejected.json.artifacts.length, 0);

  const local = await startApp({ provider: {
    name: 'escape-file',
    ready: true,
    generative: false,
    paidCalls: false,
    async render() {
      return { filePath: '/etc/passwd', mime: 'video/mp4' };
    },
  }, worker: true, pollMs: 15 });
  t.after(() => local.close());
  const localJob = await api(local.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-fail-0003', ...gateway(),
  });
  const localResult = await waitTerminal(local, localJob.json.id, gateway());
  assert.equal(localResult.json.status, 'failed');
  assert.equal(localResult.json.artifacts.length, 0);
});

test('a disabled or missing engine accepts no job and an unknown provider refuses to boot', async (t) => {
  const disabled = await startApp({ providerName: 'disabled' });
  t.after(() => disabled.close());
  const denied = await api(disabled.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-off-00001', ...gateway(),
  });
  assert.equal(denied.status, 503);
  assert.equal(denied.json.error.code, 'provider_unavailable');
  assert.equal(denied.json.error.paidCalls, undefined);
  const health = await api(disabled.base, { path: '/v1/health' });
  assert.equal(health.json.ready, false);
  assert.equal(health.json.paidCalls, false);

  const missing = await startApp({ ffmpegPath: '/no/such/ffmpeg', ffprobePath: '/no/such/ffprobe' });
  t.after(() => missing.close());
  const unavailable = await api(missing.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-off-00002', ...gateway(),
  });
  assert.equal(unavailable.status, 503);
  const listed = await api(missing.base, { path: '/v1/creative-jobs', ...gateway() });
  assert.equal(listed.json.jobs.length, 0);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-creative-boot-'));
  await assert.rejects(() => createApp({
    dataDir: dir,
    credentials: credentials(),
    providerName: 'runway',
  }));
  await assert.rejects(() => createApp({
    dataDir: dir,
    credentials: credentials(),
    allowProviderOverride: true,
    provider: { name: 'paid', ready: true, paidCalls: true, generative: true, async render() {} },
  }));
});

test('a crashed worker is recovered by the next process', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-creative-restart-'));
  const seeded = await runNode(['src/seed-cli.js', dataDir, '1']);
  assert.equal(seeded.code, 0, seeded.stderr);
  const id = seeded.stdout.trim();
  const ctx = await startApp({ dataDir, worker: false });
  t.after(() => ctx.close());
  const recovered = await api(ctx.base, {
    method: 'GET', path: `/v1/creative-jobs/${id}`, token: TOKENS.gateway, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(recovered.status, 200);
  assert.equal(recovered.json.status, 'queued');
  assert.equal(recovered.json.attempt, 1);
  assert.equal(recovered.json.artifacts.length, 0);

  const lostDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ls-creative-lost-'));
  const lostSeed = await runNode(['src/seed-cli.js', lostDir, '2']);
  const lostId = lostSeed.stdout.trim();
  const lost = await startApp({ dataDir: lostDir, worker: false });
  t.after(() => lost.close());
  const failed = await api(lost.base, {
    method: 'GET', path: `/v1/creative-jobs/${lostId}`, token: TOKENS.gateway, tenant: 'tenant-a', customer: 'cust-a',
  });
  assert.equal(failed.json.status, 'failed');
  assert.equal(failed.json.error.code, 'worker_lost');
  assert.equal(failed.json.artifacts.length, 0);
});

test('graceful shutdown returns the in-flight job to the queue', async (t) => {
  const hanging = {
    name: 'hang',
    ready: true,
    generative: false,
    paidCalls: false,
    render(_job, ctx) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 10_000);
        ctx.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new CodedError('CANCELLED', 'stopped'));
        }, { once: true });
      });
    },
  };
  const ctx = await startApp({ provider: hanging, worker: true, pollMs: 15 });
  const created = await api(ctx.base, {
    method: 'POST', path: '/v1/creative-jobs', body: videoBrief(), idempotency: 'idem-stop-0001', ...gateway(),
  });
  const started = Date.now();
  let status = created.json.status;
  while (status !== 'running' && Date.now() - started < 3000) {
    const current = await api(ctx.base, { method: 'GET', path: `/v1/creative-jobs/${created.json.id}`, ...gateway() });
    status = current.json.status;
  }
  assert.equal(status, 'running');
  await ctx.close();
  const reopened = await startApp({ dataDir: ctx.dataDir, provider: holdProvider(), worker: false });
  t.after(() => reopened.close());
  const job = await api(reopened.base, { method: 'GET', path: `/v1/creative-jobs/${created.json.id}`, ...gateway() });
  assert.equal(job.json.status, 'queued');
  assert.equal(job.json.attempt, 0);
  assert.equal(job.json.artifacts.length, 0);
});
