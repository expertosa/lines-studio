import assert from 'node:assert/strict';
import test from 'node:test';
import { assColor, assEscape, assTime, buildOverlay } from '../src/overlay.js';
import { fromBrief } from '../src/spec.js';

test('ASS helpers', () => {
  assert.equal(assColor('#E8C872'), '&H0072C8E8');
  assert.equal(assColor('#0B1F33', 0x50), '&H50331F0B');
  assert.equal(assTime(75.5), '0:01:15.50');
  assert.equal(assEscape('{x}\\n\nnext'), '\\{x\\}\\\\n\\Nnext');
});

test('overlay places captions per scene and a branded outro', () => {
  const spec = fromBrief({
    title: 'اكسبرتو',
    captions: ['نساعد منشأتك', 'من الفكرة إلى الإطلاق'],
    cta: 'اطلب عرضك',
    format: '9:16',
    seconds: 12,
  });
  const ass = buildOverlay(spec, { fonts: { ar: 'IBM Plex Sans Arabic' } });
  assert.match(ass, /PlayResX: 1080\nPlayResY: 1920/);
  assert.match(ass, /Style: Caption,IBM Plex Sans Arabic,/);
  const events = ass.split('\n').filter((line) => line.startsWith('Dialogue:'));
  assert.equal(events.filter((line) => line.includes(',Caption,')).length, 2);
  assert.ok(events.some((line) => line.includes(',Title,') && line.endsWith('اكسبرتو')));
  assert.ok(events.some((line) => line.includes(',Cta,') && line.endsWith('اطلب عرضك')));
  assert.ok(events.some((line) => line.includes(',Brand,') && line.endsWith('خطوط ستوديو')));
  const outro = spec.scenes.at(-1);
  const title = events.find((line) => line.includes(',Title,'));
  assert.ok(title.startsWith(`Dialogue: 1,${assTime(outro.start + 0.2)},`));
});

test('tagline shows in the outro only when there are no captions', () => {
  const withCaptions = buildOverlay(fromBrief({ title: 'Lines', tagline: 'We build apps.', captions: ['One'] }));
  assert.doesNotMatch(withCaptions, /,Tag,/);
  const bare = buildOverlay(fromBrief({ title: 'Lines', tagline: 'We build apps.', captions: [] }));
  assert.match(bare, /,Tag,.*We build apps\./);
});

test('the 2D title and bar are dropped when Blender renders the 3D title', () => {
  const ass = buildOverlay(fromBrief({ title: 'اكسبرتو', cta: 'اطلب' }, { font3d: '/f.ttf' }));
  assert.doesNotMatch(ass, /,Title,,/);
  assert.doesNotMatch(ass, /,Bar,,/);
  assert.match(ass, /,Cta,,/);
});

test('a soft scrim sits under the brand and the captions, below the text layer', () => {
  const spec = fromBrief({ title: 'اكسبرتو', captions: ['واحد', 'اثنين'], format: '9:16', seconds: 12 });
  const events = buildOverlay(spec).split('\n').filter((line) => line.startsWith('Dialogue:'));
  const scrims = events.filter((line) => line.includes(',Scrim,'));
  assert.equal(scrims.length, 2);
  assert.ok(scrims.every((line) => line.startsWith('Dialogue: 0,') && /\\blur\d+/.test(line)));
  assert.ok(events.filter((line) => !line.includes(',Scrim,')).every((line) => line.startsWith('Dialogue: 1,')));
  // The caption band ends when the outro starts, so it never covers the 3D title.
  assert.ok(scrims.some((line) => line.includes(`,${assTime(spec.scenes.at(-1).start + 0.2)},Scrim,`)));
});
