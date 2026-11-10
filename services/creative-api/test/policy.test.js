import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { externalEngine } from '../src/engines/external.js';
import { repoRoot, serviceRoot } from './helpers.js';

function sourceFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  };
  walk(dir);
  return files;
}

test('the API process does not call MoneyPrinterTurbo or a paid vendor', () => {
  const files = sourceFiles(path.join(serviceRoot, 'src'));
  const webhook = files.find((file) => file.endsWith(`${path.sep}webhooks.js`));
  const rest = files.filter((file) => file !== webhook).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(rest, /\bfetch\s*\(/);
  assert.doesNotMatch(rest, /https?\.request/);
  assert.match(fs.readFileSync(webhook, 'utf8'), /https\.request/);
  const all = `${rest}\n${fs.readFileSync(webhook, 'utf8')}`;
  assert.doesNotMatch(all, /openai|runway|pixabay\.com|graph\.facebook|googleapis|api\.elevenlabs/i);
  assert.equal(externalEngine.configured, false);
  assert.throws(() => externalEngine.describe(), /not configured/);
});

test('the marketing site stays a static nginx export', () => {
  const nextConfig = fs.readFileSync(path.join(repoRoot, 'next.config.mjs'), 'utf8');
  const nginx = fs.readFileSync(path.join(repoRoot, 'nginx.conf'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
  assert.match(nextConfig, /output:\s*'export'/);
  assert.doesNotMatch(nginx, /proxy_pass/);
  assert.match(dockerfile, /nginx:alpine/);
  assert.doesNotMatch(dockerfile, /creative-api/);
  assert.equal(fs.existsSync(path.join(repoRoot, '.github/workflows/ci.yml')), false);
});
