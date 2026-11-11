import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadPresenters } from '../src/presenters.js';
import { renderClaimedJob } from '../src/run.js';
import { fakeClient, fakeVendors, hasFfmpeg, makeMedia, tmp } from './helpers.js';

const skip = !hasFfmpeg && 'ffmpeg not installed';

function setup(seconds = 4) {
  const dir = tmp();
  const media = makeMedia(dir, seconds);
  const presenterDir = path.join(dir, 'presenters');
  fs.mkdirSync(presenterDir);
  fs.copyFileSync(media.png, path.join(presenterDir, 'yousef.png'));
  fs.writeFileSync(path.join(presenterDir, 'presenters.json'), JSON.stringify({
    default: 'yousef',
    presenters: [{ id: 'yousef', image: 'yousef.png', voiceId: 'nhJWWCFdNdusuVUT3x19', languages: ['ar', 'en'] }],
  }));
  return { dir, media, presenters: loadPresenters(presenterDir), tmpDir: path.join(dir, 'tmp') };
}

const job = (extra = {}) => ({
  id: 'job-ugc',
  engine: 'ugc',
  style: 'ugc',
  title: 'اكسبرتو',
  script: { text: '[casual] تدرون وش اللي غيّر شغلي هالشهر؟ اكسبرتو.' },
  format: '9:16',
  language: 'ar',
  seconds: 15,
  voice: 'presenter',
  width: 1080,
  height: 1920,
  metadata: { presenter: 'yousef' },
  ...extra,
});

test('a ugc job: voice, lip sync, captions, upload, complete', { skip }, async () => {
  const { dir, media, presenters, tmpDir } = setup();
  const vendors = fakeVendors(media);
  const client = fakeClient();
  const result = await renderClaimedJob(job(), {
    client, presenters, tmpDir, elevenKey: 'k1', falKey: 'k2', fetchImpl: vendors.fetchImpl, sleep: async () => {}, fonts: { ar: 'DejaVu Sans' },
  });
  assert.equal(result.status, 'succeeded', JSON.stringify(client.calls));
  const upload = client.calls.find((c) => c[0] === 'upload');
  assert.ok(upload[2] > 10_000 && upload[3] > 100);
  assert.equal(client.calls.at(-1)[0], 'complete');
  assert.deepEqual(vendors.calls.map((c) => c.host), ['api.elevenlabs.io', 'queue.fal.run', 'queue.fal.run', 'queue.fal.run', 'queue.fal.run', 'queue.fal.run', 'v3.fal.media']);
  assert.equal(fs.existsSync(path.join(tmpDir, 'job-ugc')), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a script longer than the job fails before the paid lip sync', { skip }, async () => {
  const { dir, media, presenters, tmpDir } = setup(20);
  const vendors = fakeVendors(media);
  const client = fakeClient();
  const result = await renderClaimedJob(job(), {
    client, presenters, tmpDir, elevenKey: 'k1', falKey: 'k2', fetchImpl: vendors.fetchImpl, sleep: async () => {},
  });
  assert.equal(result.code, 'script_too_long');
  assert.equal(vendors.calls.some((c) => c.host === 'queue.fal.run'), false);
  const [, , body] = client.calls.find((c) => c[0] === 'fail');
  assert.equal(body.retry, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('no script or unknown presenter fails without calling any vendor', { skip }, async () => {
  const { dir, media, presenters, tmpDir } = setup();
  for (const [extra, code] of [[{ script: null, prompt: 'x' }, 'script_required'], [{ metadata: { presenter: 'sara' } }, 'presenter_unknown']]) {
    const vendors = fakeVendors(media);
    const client = fakeClient();
    const result = await renderClaimedJob(job(extra), { client, presenters, tmpDir, elevenKey: 'k', falKey: 'k', fetchImpl: vendors.fetchImpl, sleep: async () => {} });
    assert.equal(result.code, code);
    assert.equal(vendors.calls.length, 0);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('captions can be turned off; the AI label is still burned in', { skip }, async () => {
  const { dir, media, presenters, tmpDir } = setup();
  const vendors = fakeVendors(media);
  const client = fakeClient();
  const result = await renderClaimedJob(job({ metadata: { presenter: 'yousef', captions: 'off' } }), {
    client, presenters, tmpDir, elevenKey: 'k', falKey: 'k', fetchImpl: vendors.fetchImpl, sleep: async () => {},
  });
  assert.equal(result.status, 'succeeded');
  // Re-encoded with the label, not the vendor file passed through.
  assert.notEqual(client.calls.find((c) => c[0] === 'upload')[2], media.mp4.length);
  fs.rmSync(dir, { recursive: true, force: true });
});
