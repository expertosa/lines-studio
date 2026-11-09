import { readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full);
    else if (entry.endsWith('.js')) files.push(full);
  }
}

walk(path.join(root, 'src'));
walk(path.join(root, 'test'));
walk(path.join(root, 'scripts'));

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(result.stderr || result.stdout);
  }
}
if (failed > 0) {
  process.stderr.write(`${failed} file(s) failed syntax check\n`);
  process.exit(1);
}
process.stdout.write(`syntax ok (${files.length} files)\n`);
