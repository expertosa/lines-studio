import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { renderClaimedJob } from '../src/worker.js';
import { assertOnDataVolume } from '../src/paths.js';

const job = {
  id: 'job-3d',
  engine: 'blender',
  style: 'promo3d',
  title: 'Experto',
  prompt: 'AI for business.',
  format: '9:16',
  seconds: 15,
  language: 'en',
  metadata: { hero: 'phone' },
};

function fakeClient() {
  const calls = [];
  return {
    calls,
    heartbeat: async (id) => { calls.push(['heartbeat', id]); return { cancelRequested: false }; },
    upload: async (id, video, thumb) => { calls.push(['upload', id, path.basename(video), thumb && path.basename(thumb)]); },
    complete: async (id) => { calls.push(['complete', id]); },
    fail: async (id, body) => { calls.push(['fail', id, body]); },
  };
}

test('worker renders, uploads video + thumbnail, completes, and cleans up', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo3d-worker-'));
  const client = fakeClient();
  let seenSpec = null;
  const result = await renderClaimedJob(job, {
    client,
    tmpDir,
    render: async (spec, opts) => {
      seenSpec = spec;
      fs.mkdirSync(opts.workDir, { recursive: true });
      fs.writeFileSync(opts.outFile, 'mp4');
      fs.writeFileSync(opts.outFile.replace('.mp4', '.jpg'), 'jpg');
      return { video: opts.outFile, thumbnail: opts.outFile.replace('.mp4', '.jpg') };
    },
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(seenSpec.quality, 'final');
  assert.equal(seenSpec.hero.type, 'phone');
  assert.deepEqual(client.calls.map((call) => call[0]), ['upload', 'complete']);
  assert.deepEqual(client.calls[0].slice(2), ['promo.mp4', 'promo.jpg']);
  assert.equal(fs.existsSync(path.join(tmpDir, job.id)), false);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('worker reports failures without leaking URLs', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo3d-worker-'));
  const client = fakeClient();
  const result = await renderClaimedJob(job, {
    client,
    tmpDir,
    render: async () => {
      throw Object.assign(new Error('blender exited 1 see https://internal.example/log'), { code: 'render_failed', retry: true });
    },
  });
  assert.equal(result.status, 'failed');
  const [, , body] = client.calls.find((call) => call[0] === 'fail');
  assert.equal(body.code, 'render_failed');
  assert.equal(body.retry, true);
  assert.doesNotMatch(body.message, /internal\.example/);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('worker mode refuses paths off the external drive', () => {
  assert.throws(() => assertOnDataVolume('/Users/me/blender'), /Volumes\/Data/);
  assert.equal(assertOnDataVolume('/Volumes/Data/lines-video-worker'), '/Volumes/Data/lines-video-worker');
});
