import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { loadPresenters, mimeFor } from '../src/presenters.js';
import { tmp } from './helpers.js';

function folder(json, files = ['yousef.png']) {
  const dir = tmp('presenters-');
  for (const file of files) fs.writeFileSync(path.join(dir, file), 'x');
  fs.writeFileSync(path.join(dir, 'presenters.json'), JSON.stringify(json));
  return dir;
}

test('presenters load, default, and refuse unknown or wrong-language picks', () => {
  const dir = folder({
    default: 'yousef',
    presenters: [{ id: 'yousef', name: 'يوسف', image: 'yousef.png', voiceId: 'nhJWWCFdNdusuVUT3x19', languages: ['ar'], prompt: 'Casual.' }],
  });
  const presenters = loadPresenters(dir);
  assert.deepEqual(presenters.ids, ['yousef']);
  const yousef = presenters.pick(undefined, 'ar');
  assert.equal(yousef.image, path.join(dir, 'yousef.png'));
  assert.equal(yousef.voiceId, 'nhJWWCFdNdusuVUT3x19');
  assert.throws(() => presenters.pick('sara', 'ar'), (e) => e.code === 'presenter_unknown' && e.retry === false);
  assert.throws(() => presenters.pick('yousef', 'en'), (e) => e.code === 'presenter_language');
  assert.equal(mimeFor('a.webp'), 'image/webp');
});

test('presenter images must be plain file names that exist in the folder', () => {
  const base = { voiceId: 'nhJWWCFdNdusuVUT3x19' };
  assert.throws(() => loadPresenters(folder({ presenters: [{ ...base, id: 'a', image: '../secrets/fal-key' }] })), /file name/);
  assert.throws(() => loadPresenters(folder({ presenters: [{ ...base, id: 'a', image: 'missing.png' }] })), /missing/);
  assert.throws(() => loadPresenters(folder({ presenters: [{ id: 'a', image: 'yousef.png', voiceId: 'x' }] })), /voiceId/);
  assert.throws(() => loadPresenters(folder({ presenters: [] })), /no presenters/);
});
