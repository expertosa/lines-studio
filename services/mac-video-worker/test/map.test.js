import assert from 'node:assert/strict';
import test from 'node:test';
import { toMoneyPrinter } from '../src/map.js';
import { assertOnDataVolume, resolveVideoRef } from '../src/paths.js';

const job = {
  engine: 'moneyprinter',
  title: 'عرض من اكسبرتو',
  style: 'promo',
  format: '9:16',
  language: 'ar',
  seconds: 30,
  voice: 'ar-SA-HamedNeural',
  prompt: 'منتج جديد',
};

test('maps an Arabic promo onto Pixabay and Edge TTS', () => {
  const body = toMoneyPrinter(job);
  assert.equal(body.video_source, 'pixabay');
  assert.equal(body.video_aspect, '9:16');
  assert.equal(body.voice_name, 'ar-SA-HamedNeural');
  assert.equal(body.video_language, 'ar');
  assert.equal(body.paragraph_number, 2);
  assert.equal(body.video_clip_duration, 4);
  assert.equal(body.video_script, '');
  assert.equal(body.video_script_prompt, 'منتج جديد');
  assert.match(body.custom_system_prompt, /اكسبرتو/);
  assert.equal(body.font_name, 'NotoNaskhArabic-Regular.ttf');
});

test('a supplied script is the narration and skips the LLM prompt', () => {
  const body = toMoneyPrinter({
    ...job,
    seconds: 60,
    script: { text: 'النص الجاهز', scenes: [{ text: 'مشهد' }] },
  });
  assert.equal(body.video_script, 'النص الجاهز');
  assert.equal(body.video_script_prompt, '');
  assert.equal(body.custom_system_prompt, '');
  assert.equal(body.paragraph_number, 4);
});

test('refuses a template job and paths that are not on the external drive', () => {
  assert.throws(() => toMoneyPrinter({ ...job, engine: 'template' }), /moneyprinter/);
  assert.equal(assertOnDataVolume('/Volumes/Data/lines-video-worker'), '/Volumes/Data/lines-video-worker');
  assert.throws(() => assertOnDataVolume('/tmp/lines-video-worker'), /Volumes\/Data/);
  assert.throws(() => assertOnDataVolume('/Users/me/lines-video-worker'), /Volumes\/Data/);
  assert.throws(() => assertOnDataVolume('lines-video-worker'), /absolute/);
});

test('only accepts MoneyPrinterTurbo URLs and files inside the worker root', () => {
  const workerRoot = '/Volumes/Data/lines-video-worker';
  const mptBase = 'http://127.0.0.1:8080';
  const local = resolveVideoRef('/tasks/abc/final-1.mp4', { mptBase, workerRoot });
  assert.equal(local.kind, 'url');
  assert.equal(local.url, 'http://127.0.0.1:8080/tasks/abc/final-1.mp4');
  const file = resolveVideoRef('/Volumes/Data/lines-video-worker/MoneyPrinterTurbo/storage/tasks/final-1.mp4', { mptBase, workerRoot });
  assert.equal(file.kind, 'file');
  assert.throws(() => resolveVideoRef('http://evil.example/final-1.mp4', { mptBase, workerRoot }), /host/);
  assert.throws(() => resolveVideoRef('/Volumes/Data/other-app/final-1.mp4', { mptBase, workerRoot }), /outside/);
});
