#!/usr/bin/env node
// Stands in for Blender in tests: reads the spec and writes solid-colour frames with ffmpeg.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const argv = process.argv.slice(process.argv.indexOf('--') + 1);
const arg = (name) => argv[argv.indexOf(name) + 1];
const spec = JSON.parse(fs.readFileSync(arg('--spec'), 'utf8'));
const frames = spec.seconds * spec.fps;
const w = Math.round(spec.width / 2);
const h = Math.round(spec.height / 2);
const result = spawnSync('ffmpeg', [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'lavfi', '-i', `testsrc2=s=${w}x${h}:r=${spec.fps}:d=${spec.seconds}`,
  '-frames:v', String(frames), '-start_number', '1', `${arg('--frames')}/frame_%04d.png`,
], { stdio: 'inherit' });
for (let i = 1; i <= frames; i += 30) console.log(`PROMO3D_FRAME ${i} ${frames}`);
process.exit(result.status ?? 1);
