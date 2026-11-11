import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const blenderDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../blender');
const hasPython = spawnSync('python3', ['--version']).status === 0;

function run(code) {
  const result = spawnSync('python3', ['-I', '-c', `import sys, json; sys.path.insert(0, ${JSON.stringify(blenderDir)})\nfrom arabic import shape, visual\n${code}`], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

const hex = (text) => [...text].map((c) => c.codePointAt(0).toString(16).toUpperCase());

test('Arabic letters take their joined forms', { skip: !hasPython && 'python3 missing' }, () => {
  const out = run("print(json.dumps([shape('اكسبرتو'), shape('السلام'), shape('الآن'), shape('ء')]))");
  // ا(iso) ك(ini) س(med) ب(med) ر(fin) ت(ini) و(fin)
  assert.deepEqual(hex(out[0]), ['FE8D', 'FEDB', 'FEB4', 'FE92', 'FEAE', 'FE97', 'FEEE']);
  // lam-alef ligature, final form after a joining letter: السلام -> ... ﻼ ...
  assert.ok(hex(out[1]).includes('FEFC'));
  // after a non-joining alef the lam-alef is isolated
  assert.deepEqual(hex(out[2]), ['FE8D', 'FEF5', 'FEE5']);
  assert.deepEqual(hex(out[3]), ['FE80']);
});

test('visual order is right-to-left and keeps Latin and digits readable', { skip: !hasPython && 'python3 missing' }, () => {
  const [ar, mixed, latin] = run("print(json.dumps([visual('خطوط ستوديو'), visual('عرض 2026 من Experto'), visual('Lines Studio')]))");
  assert.equal(hex(ar)[0], 'FEEE'); // last letter (و final) comes first in visual order
  assert.ok(mixed.startsWith('Experto ') && mixed.includes(' 2026 '));
  assert.equal(latin, 'Lines Studio');
});
