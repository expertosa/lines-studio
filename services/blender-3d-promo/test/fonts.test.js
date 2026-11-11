import assert from 'node:assert/strict';
import test from 'node:test';
import { FONT_3D_CANDIDATES, resolve3dFont } from '../src/fonts.js';

test('3D font: override wins, else the first installed candidate', () => {
  assert.equal(resolve3dFont('/my/font.ttf', (p) => p === '/my/font.ttf'), '/my/font.ttf');
  assert.equal(resolve3dFont('/missing.ttf', () => false), null);
  assert.equal(resolve3dFont(null, (p) => p === FONT_3D_CANDIDATES[3]), FONT_3D_CANDIDATES[3]);
  assert.equal(resolve3dFont(null, () => false), null);
});
