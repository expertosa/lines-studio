import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PALETTE, fromBrief, fromJob, parsePalette, splitCaptions, timeline } from '../src/spec.js';

test('palette accepts a comma list or an object and ignores bad colours', () => {
  assert.deepEqual(parsePalette('#101828,#a78bfa,nope'), {
    ...DEFAULT_PALETTE,
    background: '#101828',
    primary: '#A78BFA',
  });
  assert.equal(parsePalette({ accent: '#00FF00', text: 'red' }).accent, '#00FF00');
  assert.equal(parsePalette({ text: 'red' }).text, DEFAULT_PALETTE.text);
});

test('captions split on Arabic and Latin sentence breaks', () => {
  assert.deepEqual(splitCaptions('حلول جاهزة، وتنفيذ سريع. من الفكرة إلى الإطلاق'), [
    'حلول جاهزة،',
    'وتنفيذ سريع.',
    'من الفكرة إلى الإطلاق',
  ]);
  assert.equal(splitCaptions('a. b. c. d. e. f. g. h.', 4).length, 4);
});

test('timeline covers the whole clip and ends with an outro', () => {
  const scenes = timeline(['one', 'two', 'three'], 15, [2, 1, 1]);
  assert.equal(scenes[0].start, 0);
  assert.equal(scenes.at(-1).shot, 'outro');
  assert.equal(scenes.at(-1).end, 15);
  assert.ok(scenes[0].end - scenes[0].start > scenes[1].end - scenes[1].start);
  for (let i = 1; i < scenes.length; i += 1) assert.equal(scenes[i].start, scenes[i - 1].end);
  assert.deepEqual(scenes.map((scene) => scene.shot), ['reveal', 'orbit', 'close', 'outro']);
  const empty = timeline([], 10);
  assert.deepEqual(empty.map((scene) => scene.shot), ['reveal', 'outro']);
});

test('a brief becomes a full spec with sensible defaults', () => {
  const spec = fromBrief({ title: 'اكسبرتو', tagline: 'حلول ذكية', format: '9:16' });
  assert.equal(spec.version, 1);
  assert.equal(spec.language, 'ar');
  assert.equal(spec.brand, 'خطوط ستوديو');
  assert.deepEqual([spec.width, spec.height, spec.fps, spec.seconds], [1080, 1920, 30, 15]);
  assert.equal(spec.hero.type, 'phone');
  assert.equal(spec.hero.focus, 0.85);
  assert.equal(spec.quality, 'draft');
  assert.equal(spec.renderEngine, 'eevee');
  assert.equal(fromBrief({ title: 'Lines', format: '16:9' }).hero.type, 'laptop');
  assert.throws(() => fromBrief({}), /title/);
});

test('an API job maps to a spec without reading outside the assets folder', () => {
  const job = {
    id: 'job-1',
    engine: 'blender',
    style: 'promo3d',
    title: 'Experto',
    prompt: 'AI for your business. Launch faster.',
    format: '1:1',
    seconds: 30,
    language: 'en',
    metadata: { palette: '#000000,#FFFFFF,#FF0000', hero: 'orb', heroAsset: 'experto.webp', cta: 'experto.sa' },
  };
  const spec = fromJob(job, { assetsDir: '/Volumes/Data/lines-video-worker/blender/assets' });
  assert.equal(spec.hero.type, 'orb');
  assert.equal(spec.hero.image, '/Volumes/Data/lines-video-worker/blender/assets/experto.webp');
  assert.equal(spec.palette.background, '#000000');
  assert.equal(spec.cta, 'experto.sa');
  assert.equal(spec.quality, 'final');
  assert.deepEqual(spec.scenes.filter((scene) => scene.text).map((scene) => scene.text), ['AI for your business.', 'Launch faster.']);

  const sneaky = fromJob({ ...job, metadata: { heroAsset: '../secrets/worker-token' } }, { assetsDir: '/Volumes/Data/x' });
  assert.equal(sneaky.hero.image, null);
  const remote = fromJob({ ...job, metadata: { heroAsset: 'https://example.com/a.png' } }, { assetsDir: '/Volumes/Data/x' });
  assert.equal(remote.hero.image, null);
  assert.throws(() => fromJob({ ...job, engine: 'moneyprinter' }), /blender/);
});

test('script scenes from the API keep their order and requested lengths', () => {
  const spec = fromJob({
    engine: 'blender',
    title: 'T',
    format: '16:9',
    seconds: 15,
    language: 'en',
    script: { text: 'a\nb', scenes: [{ text: 'a', seconds: 6 }, { text: 'b', seconds: 2 }] },
  });
  const [a, b] = spec.scenes;
  assert.equal(a.text, 'a');
  assert.equal(b.text, 'b');
  assert.ok(a.end - a.start > (b.end - b.start) * 2);
});
