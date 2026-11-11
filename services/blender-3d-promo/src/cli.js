#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { fromBrief } from './spec.js';
import { resolve3dFont } from './fonts.js';
import { renderPromo, renderStill } from './render.js';

const USAGE = `Lines Studio — 3D promo videos with Blender

Usage:
  node src/cli.js <brief.json> [options]

Options:
  --out <file.mp4>       Output video (default: out/<brief name>.mp4)
  --quality draft|final  draft = half resolution, fewer samples (default: brief or draft)
  --engine eevee|cycles|workbench
  --format 9:16|16:9|1:1 Override the brief format
  --seconds <n>          Override the brief length (5-120)
  --still <frame>        Render one frame (no text) and stop
  --music <file>         Background music (looped, faded)
  --save-blend           Also save the generated scene as a .blend next to the video
  --keep-frames          Keep the PNG frames
  --blender <path>       Blender binary (env BLENDER_BIN, default "blender")
  --python <path>        Use a Python that has the bpy module instead of Blender
  --fonts-dir <dir>      Extra font directory for the text layer
  --spec-only            Print the render spec and exit

Environment: BLENDER_BIN, BPY_PYTHON, FFMPEG_BIN, PROMO_FONT_AR, PROMO_FONT_EN (font family names),
             PROMO_FONT_3D (font file for the extruded title; needs Arabic presentation forms)
`;

function fail(message) {
  process.stderr.write(`${message}\n\n${USAGE}`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    quality: { type: 'string' },
    engine: { type: 'string' },
    format: { type: 'string' },
    seconds: { type: 'string' },
    still: { type: 'string' },
    music: { type: 'string' },
    'save-blend': { type: 'boolean' },
    'keep-frames': { type: 'boolean' },
    blender: { type: 'string' },
    python: { type: 'string' },
    'fonts-dir': { type: 'string' },
    'spec-only': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help) {
  process.stdout.write(USAGE);
  process.exit(0);
}
const briefPath = positionals[0];
if (!briefPath) fail('A brief JSON file is required.');
const briefDir = path.dirname(path.resolve(briefPath));
let brief;
try {
  brief = JSON.parse(fs.readFileSync(briefPath, 'utf8'));
} catch (error) {
  fail(`Could not read ${briefPath}: ${error.message}`);
}
if (values.quality) brief.quality = values.quality;
if (values.engine) brief.renderEngine = values.engine;
if (values.format) brief.format = values.format;
if (values.seconds) brief.seconds = Number(values.seconds);

const font3d = resolve3dFont(process.env.PROMO_FONT_3D);
const spec = fromBrief(brief, { resolveImage: (image) => path.resolve(briefDir, image), font3d });
if (brief.title3d !== false && !font3d) process.stderr.write('No 3D title font found (set PROMO_FONT_3D); using the 2D title.\n');
if (spec.hero.image && !fs.existsSync(spec.hero.image)) fail(`Hero image not found: ${spec.hero.image}`);
if (values['spec-only']) {
  process.stdout.write(`${JSON.stringify(spec, null, 2)}\n`);
  process.exit(0);
}

const name = path.basename(briefPath).replace(/\.json$/i, '');
const outFile = path.resolve(values.out || path.join('out', `${name}.mp4`));
const workDir = path.join(path.dirname(outFile), '.work', name);
const blender = values.blender || process.env.BLENDER_BIN || 'blender';
const python = values.python || process.env.BPY_PYTHON || null;

const controller = new AbortController();
process.on('SIGINT', () => controller.abort());

try {
  if (values.still) {
    const still = await renderStill(spec, { workDir, frame: Number(values.still), blender, python, signal: controller.signal });
    const target = outFile.replace(/\.mp4$/i, `-frame${values.still}.png`);
    fs.copyFileSync(still, target);
    process.stdout.write(`${target}\n`);
  } else {
    let last = -1;
    const started = Date.now();
    const result = await renderPromo(spec, {
      workDir,
      outFile,
      blender,
      python,
      ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
      music: values.music ? path.resolve(values.music) : null,
      fonts: { ar: process.env.PROMO_FONT_AR, en: process.env.PROMO_FONT_EN },
      fontsDir: values['fonts-dir'] ? path.resolve(values['fonts-dir']) : null,
      saveBlend: values['save-blend'] ? outFile.replace(/\.mp4$/i, '.blend') : null,
      keepFrames: values['keep-frames'],
      signal: controller.signal,
      onProgress(event) {
        if (event.stage === 'frames') {
          const pct = Math.floor((event.frame / event.total) * 100);
          if (pct !== last && pct % 5 === 0) {
            last = pct;
            process.stderr.write(`frames ${event.frame}/${event.total} (${pct}%)\n`);
          }
        } else {
          process.stderr.write('encoding…\n');
        }
      },
    });
    process.stderr.write(`done in ${Math.round((Date.now() - started) / 1000)}s\n`);
    process.stdout.write(`${result.video}\n`);
  }
} catch (error) {
  process.stderr.write(`render failed: ${error.message}\n`);
  process.exit(1);
}
