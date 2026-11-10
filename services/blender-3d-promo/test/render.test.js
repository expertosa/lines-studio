import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { encodeArgs, renderPromo, sceneCommand } from '../src/render.js';
import { fromBrief } from '../src/spec.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const fakeBlender = path.join(here, 'fake-blender.js');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('Blender is run headless with a failing exit code on script errors', () => {
  const [bin, args] = sceneCommand({ blender: '/Applications/Blender.app/Contents/MacOS/Blender' }, ['--spec', 's.json']);
  assert.equal(bin, '/Applications/Blender.app/Contents/MacOS/Blender');
  assert.deepEqual(args.slice(0, 5), ['-b', '--factory-startup', '-noaudio', '--python-exit-code', '1']);
  assert.ok(args.at(-3).endsWith(path.join('blender', 'promo3d.py')) || args.includes('--'));
  const [py, pyArgs] = sceneCommand({ python: '/opt/bpy/bin/python' }, ['--spec', 's.json']);
  assert.equal(py, '/opt/bpy/bin/python');
  assert.ok(pyArgs[0].endsWith('promo3d.py'));
});

test('encode args scale draft frames, burn text and fade music', () => {
  const spec = fromBrief({ title: 'Lines', seconds: 10, format: '1:1' });
  const args = encodeArgs(spec, { framesDir: '/w/frames', assPath: '/w/o.ass', music: '/m.mp3', outFile: '/o.mp4' });
  const vf = args[args.indexOf('-vf') + 1];
  assert.match(vf, /^scale=1080:1080:flags=lanczos,ass=\/w\/o\.ass,format=yuv420p$/);
  assert.ok(args.includes('-stream_loop'));
  assert.match(args[args.indexOf('-af') + 1], /afade=t=out:st=8\.5/);
  assert.equal(args[args.indexOf('-t') + 1], '10');
});

test('renderPromo produces an MP4 and a thumbnail', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo3d-'));
  try {
    const spec = fromBrief({ title: 'Lines Studio', captions: ['Websites and apps.'], seconds: 5, fps: 24, format: '16:9' });
    const progress = [];
    const result = await renderPromo(spec, {
      workDir: path.join(dir, 'work'),
      outFile: path.join(dir, 'promo.mp4'),
      blender: fakeBlender,
      onProgress: (event) => progress.push(event.stage),
    });
    assert.ok(fs.statSync(result.video).size > 1000);
    assert.ok(result.thumbnail && fs.statSync(result.thumbnail).size > 100);
    assert.ok(progress.includes('frames') && progress.includes('encode'));
    assert.equal(fs.existsSync(path.join(dir, 'work', 'frames')), false);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', result.video], { encoding: 'utf8' });
    const info = JSON.parse(probe.stdout);
    assert.equal(info.streams[0].width, 1920);
    assert.equal(info.streams[0].height, 1080);
    assert.ok(Math.abs(Number(info.format.duration) - 5) < 0.2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a crash after every frame is written still produces the video', { skip: !hasFfmpeg && 'ffmpeg not installed' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo3d-'));
  try {
    const result = await renderPromo(fromBrief({ title: 'Lines', seconds: 5, fps: 24 }), {
      workDir: path.join(dir, 'work'),
      outFile: path.join(dir, 'promo.mp4'),
      blender: path.join(here, 'fake-blender-crash.js'),
    });
    assert.ok(fs.statSync(result.video).size > 1000);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a Blender failure is reported as a retryable render error', { skip: !fs.existsSync('/bin/false') && 'no /bin/false' }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'promo3d-'));
  try {
    await assert.rejects(
      renderPromo(fromBrief({ title: 'x', seconds: 5 }), { workDir: dir, outFile: path.join(dir, 'o.mp4'), blender: '/bin/false' }),
      (error) => error.code === 'render_failed' && error.retry === true,
    );
    await assert.rejects(
      renderPromo(fromBrief({ title: 'x', seconds: 5 }), { workDir: dir, outFile: path.join(dir, 'o.mp4'), blender: '/nonexistent/blender' }),
      (error) => error.code === 'render_failed' && error.retry === false && /could not start/.test(error.message),
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
