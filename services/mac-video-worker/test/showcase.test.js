import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { downloadShowcaseImage, parseShowcaseImageUrl } from '../src/image-url.js';
import { rendererFor } from '../src/run.js';
import { showcaseFilter, renderShowcaseFile } from '../src/showcase.js';

const ARTIFACT = 'https://api.lines.studio/v1/jobs/11111111-1111-4111-8111-111111111111/artifacts/22222222-2222-4222-8222-222222222222';

test('showcase stays on local ffmpeg and never asks MoneyPrinterTurbo', () => {
  assert.equal(rendererFor({ engine: 'showcase', style: 'showcase' }), 'showcase');
  assert.equal(rendererFor({ engine: 'moneyprinter', style: 'showcase' }), 'showcase');
  assert.equal(rendererFor({ engine: 'moneyprinter', style: 'promo' }), 'moneyprinter');
  const filter = showcaseFilter(8);
  assert.match(filter, /zoompan=/);
  assert.match(filter, /gblur=/);
  assert.match(filter, /d=240/);
  assert.match(filter, /on\/239/);
  assert.doesNotMatch(filter, /drawtext|subtitles|ass=|anullsrc|aevalsrc/i);
  assert.throws(() => showcaseFilter(5), /6 to 10/);
  assert.throws(() => showcaseFilter(15), /6 to 10/);
});

test('image URLs are limited to lines.studio stills and API artifacts', () => {
  assert.equal(parseShowcaseImageUrl('https://lines.studio/work/mashhad.webp')?.href, 'https://lines.studio/work/mashhad.webp');
  assert.equal(
    parseShowcaseImageUrl(`${ARTIFACT}?exp=1800000000&sig=abcdef0123456789`)?.href,
    `${ARTIFACT}?exp=1800000000&sig=abcdef0123456789`,
  );
  for (const raw of [
    'http://lines.studio/work/mashhad.webp',
    'https://user:pass@lines.studio/work/mashhad.webp',
    'https://lines.studio/work/../secret.webp',
    'https://evil.example/work/mashhad.webp',
    'https://lines.studio.evil.com/work/mashhad.webp',
    'https://169.254.169.254/latest/meta-data',
    'https://api.lines.studio/v1/health',
    'https://api.lines.studio/v1/jobs/not-a-uuid/artifacts/nope',
    `${ARTIFACT}?next=http://127.0.0.1`,
  ]) {
    assert.equal(parseShowcaseImageUrl(raw), null, raw);
  }
});

test('a private address or a redirect is not fetched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-image-'));
  const destination = path.join(dir, 'still.webp');
  try {
    await assert.rejects(() => downloadShowcaseImage('https://lines.studio/work/mashhad.webp', destination, {
      lookup: async () => ['127.0.0.1'],
      fetchImpl: async () => {
        throw new Error('fetched a private address');
      },
    }), (error) => error.retry === false && /not allowed/.test(error.message));
    await assert.rejects(() => downloadShowcaseImage('https://lines.studio/work/mashhad.webp', destination, {
      lookup: async () => ['1.1.1.1'],
      fetchImpl: async () => ({ status: 302, ok: false, headers: { get: () => '' } }),
    }), (error) => error.retry === false && /redirect/.test(error.message));
    assert.equal(fs.existsSync(destination), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('ffmpeg renders a silent 720x1280 loop with no subtitle stream', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lines-showcase-'));
  const plate = path.join(dir, 'plate.png');
  const output = path.join(dir, 'clip.mp4');
  try {
    const made = spawnSync('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', 'testsrc2=size=960x540:rate=1:duration=1',
      '-frames:v', '1', plate,
    ], { encoding: 'utf8' });
    assert.equal(made.status, 0, made.stderr);
    await renderShowcaseFile({ imagePath: plate, outputPath: output, seconds: 6 });
    const probe = spawnSync('ffprobe', [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', output,
    ], { encoding: 'utf8' });
    assert.equal(probe.status, 0, probe.stderr);
    const parsed = JSON.parse(probe.stdout);
    const types = (parsed.streams || []).map((stream) => stream.codec_type);
    assert.deepEqual(types, ['video']);
    const video = parsed.streams[0];
    assert.equal(video.codec_name, 'h264');
    assert.equal(video.width, 720);
    assert.equal(video.height, 1280);
    assert.ok(Math.abs(Number(parsed.format.duration) - 6) < 0.05, parsed.format.duration);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
