#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { parseBrief } from './brief.js';
import { buildCalendar } from './calendar.js';
import { generatePieces } from './generate.js';
import { toCsv, toMarkdown, toVideoJobs } from './output.js';

const USAGE = `Lines Studio — Arabic social media content calendar

Usage:
  node src/cli.js <brief.json> [options]

Options:
  --out <dir>          Output folder (default: out/)
  --plan-only          Print the month's slots and stop (no API call, no cost)
  --effort <level>     low | medium (default) | high
  --presenter <id>     Presenter for the reel video jobs (default: yousef)

Writes <name>.json, <name>.md (review sheet), <name>.csv (scheduler import)
and <name>-video-jobs.json (reels as UGC jobs for the video API, not sent).
Credentials: ANTHROPIC_API_KEY, or an "ant auth login" profile.
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    'plan-only': { type: 'boolean' },
    effort: { type: 'string' },
    presenter: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

function fail(message) {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(1);
}

if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
if (!positionals[0]) fail('A brief JSON file is required.');
if (values.effort && !['low', 'medium', 'high'].includes(values.effort)) fail('--effort must be low, medium or high');

let brief;
try {
  brief = parseBrief(JSON.parse(fs.readFileSync(positionals[0], 'utf8')));
} catch (error) {
  fail(`Brief: ${error.message}`);
}
const slots = buildCalendar(brief);
if (values['plan-only']) {
  for (const s of slots) process.stdout.write(`${s.id}  ${s.date}  ${s.platform.padEnd(9)}  ${s.kind.padEnd(5)}  ${s.pillar}${s.occasion ? `  (${s.occasion})` : ''}\n`);
  process.stdout.write(`${slots.length} slots\n`);
  process.exit(0);
}

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());
const name = path.basename(positionals[0]).replace(/\.json$/i, '');
const outDir = path.resolve(values.out || 'out');
try {
  process.stderr.write(`writing ${slots.length} pieces…\n`);
  const { items, usage, model } = await generatePieces(brief, slots, { effort: values.effort || 'medium', signal: controller.signal });
  fs.mkdirSync(outDir, { recursive: true });
  const base = path.join(outDir, name);
  fs.writeFileSync(`${base}.json`, JSON.stringify({ brief, model, items }, null, 2));
  fs.writeFileSync(`${base}.md`, toMarkdown(brief, items));
  fs.writeFileSync(`${base}.csv`, toCsv(items));
  fs.writeFileSync(`${base}-video-jobs.json`, JSON.stringify(toVideoJobs(brief, items, { presenter: values.presenter }), null, 2));
  const flagged = items.filter((i) => i.issues.length).length;
  process.stderr.write(`done: ${items.length} pieces, ${flagged} to review · tokens in ${usage.input_tokens} out ${usage.output_tokens}\n`);
  process.stdout.write(`${base}.md\n`);
} catch (error) {
  process.stderr.write(`failed (${error.code || error.name}): ${error.message}\n`);
  process.exit(1);
}
