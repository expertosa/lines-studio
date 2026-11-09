import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot, serviceRoot } from './helpers.js';

function sourceText() {
  const root = path.join(serviceRoot, 'src');
  const parts = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) parts.push(fs.readFileSync(full, 'utf8'));
    }
  };
  walk(root);
  return parts.join('\n');
}

test('the API source has no network client and no paid provider', () => {
  const source = sourceText();
  assert.doesNotMatch(source, /\bfetch\s*\(/);
  assert.doesNotMatch(source, /https?\.request/);
  assert.doesNotMatch(source, /\baxios\b/);
  assert.doesNotMatch(source, /openai|runway|graph\.facebook|googleapis|tiktok|admanager/i);
  assert.match(source, /paidCalls !== false/);
  assert.match(fs.readFileSync(path.join(serviceRoot, 'src/index.js'), 'utf8'), /ALLOWED_PROVIDERS/);
  assert.doesNotMatch(fs.readFileSync(path.join(serviceRoot, 'src/index.js'), 'utf8'), /allowProviderOverride/);
});

test('the marketing site stays a static nginx export', () => {
  const nextConfig = fs.readFileSync(path.join(repoRoot, 'next.config.mjs'), 'utf8');
  const nginx = fs.readFileSync(path.join(repoRoot, 'nginx.conf'), 'utf8');
  const dockerfile = fs.readFileSync(path.join(repoRoot, 'Dockerfile'), 'utf8');
  assert.match(nextConfig, /output:\s*'export'/);
  assert.doesNotMatch(nginx, /proxy_pass/);
  assert.match(dockerfile, /nginx:alpine/);
  assert.doesNotMatch(dockerfile, /creative-api/);
});
