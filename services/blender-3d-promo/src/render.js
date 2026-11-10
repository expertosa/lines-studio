import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOverlay } from './overlay.js';

export const SCENE_SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../blender/promo3d.py');

function childEnv(workDir) {
  return {
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    HOME: process.env.HOME || workDir,
    LANG: 'C.UTF-8',
    TMPDIR: workDir,
  };
}

function abortError() {
  return Object.assign(new Error('cancelled'), { code: 'cancelled', retry: false });
}

function run(bin, args, { workDir, signal, onLine }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const child = spawn(bin, args, { env: childEnv(workDir), stdio: ['ignore', 'pipe', 'pipe'] });
    const tail = [];
    let buffer = '';
    const keep = (chunk) => {
      tail.push(...String(chunk).split('\n').filter(Boolean));
      tail.splice(0, Math.max(0, tail.length - 20));
    };
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const parts = buffer.split('\n');
      buffer = parts.pop();
      for (const line of parts) onLine?.(line);
      keep(chunk);
    });
    child.stderr.on('data', keep);
    const onAbort = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', (error) => {
      signal?.removeEventListener('abort', onAbort);
      reject(Object.assign(new Error(`${path.basename(bin)} could not start: ${error.code || error.message}`), {
        code: 'render_failed',
        retry: false,
      }));
    });
    child.on('close', (code) => {
      signal?.removeEventListener('abort', onAbort);
      if (signal?.aborted) {
        reject(abortError());
        return;
      }
      if (code !== 0) {
        reject(Object.assign(new Error(`${path.basename(bin)} exited ${code}: ${tail.slice(-3).join(' | ')}`.slice(0, 400)), {
          code: 'render_failed',
          retry: true,
        }));
        return;
      }
      resolve();
    });
  });
}

function filterPath(file) {
  return file.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

/** Command that runs the scene script: the Blender app, or a Python with the `bpy` module. */
export function sceneCommand({ blender, python }, scriptArgs) {
  if (python) return [python, [SCENE_SCRIPT, '--', ...scriptArgs]];
  return [blender || 'blender', ['-b', '--factory-startup', '-noaudio', '--python-exit-code', '1', '-P', SCENE_SCRIPT, '--', ...scriptArgs]];
}

export function encodeArgs(spec, { framesDir, assPath, music, fontsDir, outFile }) {
  const fonts = fontsDir ? `:fontsdir=${filterPath(fontsDir)}` : '';
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-framerate', String(spec.fps), '-start_number', '1', '-i', path.join(framesDir, 'frame_%04d.png'),
  ];
  if (music) args.push('-stream_loop', '-1', '-i', music);
  args.push(
    '-vf', `scale=${spec.width}:${spec.height}:flags=lanczos,ass=${filterPath(assPath)}${fonts},format=yuv420p`,
    '-c:v', 'libx264', '-preset', spec.quality === 'final' ? 'slow' : 'veryfast', '-crf', '18',
    '-r', String(spec.fps),
  );
  if (music) {
    const fadeOut = Math.max(0, spec.seconds - 1.5);
    args.push('-af', `afade=t=in:d=0.8,afade=t=out:st=${fadeOut}:d=1.5`, '-c:a', 'aac', '-b:a', '192k', '-shortest');
  } else {
    args.push('-an');
  }
  args.push('-t', String(spec.seconds), '-movflags', '+faststart', outFile);
  return args;
}

/**
 * Render a spec to MP4 (+ JPEG thumbnail).
 * 1. Blender builds the scene and writes frame_####.png.
 * 2. ffmpeg scales, burns the ASS typography, adds optional music, encodes H.264.
 */
export async function renderPromo(spec, {
  workDir,
  outFile,
  blender,
  python,
  ffmpeg = 'ffmpeg',
  music = null,
  fonts = {},
  fontsDir = null,
  saveBlend = null,
  keepFrames = false,
  signal,
  onProgress,
}) {
  fs.mkdirSync(workDir, { recursive: true });
  const framesDir = path.join(workDir, 'frames');
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  const specPath = path.join(workDir, 'spec.json');
  const assPath = path.join(workDir, 'overlay.ass');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  fs.writeFileSync(assPath, buildOverlay(spec, { fonts }), 'utf8');

  const total = Math.round(spec.seconds * spec.fps);
  const scriptArgs = ['--spec', specPath, '--frames', framesDir];
  if (saveBlend) scriptArgs.push('--save-blend', saveBlend);
  const [bin, args] = sceneCommand({ blender, python }, scriptArgs);
  await run(bin, args, {
    workDir,
    signal,
    onLine(line) {
      const match = /^PROMO3D_FRAME (\d+) (\d+)/.exec(line);
      if (match) onProgress?.({ stage: 'frames', frame: Number(match[1]), total: Number(match[2]) });
    },
  });
  const rendered = fs.readdirSync(framesDir).filter((name) => /^frame_\d{4}\.png$/.test(name)).length;
  if (rendered < total) {
    throw Object.assign(new Error(`Blender wrote ${rendered} of ${total} frames`), { code: 'render_failed', retry: true });
  }

  onProgress?.({ stage: 'encode' });
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  await run(ffmpeg, encodeArgs(spec, { framesDir, assPath, music, fontsDir, outFile }), { workDir, signal });

  const thumbnail = outFile.replace(/\.mp4$/i, '') + '.jpg';
  await run(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-ss', String(Math.max(0, spec.seconds - 1.2)), '-i', outFile, '-frames:v', '1', '-q:v', '3', thumbnail,
  ], { workDir, signal }).catch(() => null);

  if (!keepFrames) fs.rmSync(framesDir, { recursive: true, force: true });
  return { video: outFile, thumbnail: fs.existsSync(thumbnail) ? thumbnail : null, frames: total };
}

/** Render one frame (no text) for a quick look before a full render. */
export async function renderStill(spec, { workDir, frame, blender, python, signal }) {
  fs.mkdirSync(workDir, { recursive: true });
  const specPath = path.join(workDir, 'spec.json');
  fs.writeFileSync(specPath, JSON.stringify(spec, null, 2));
  const [bin, args] = sceneCommand({ blender, python }, ['--spec', specPath, '--frames', workDir, '--still', String(frame)]);
  await run(bin, args, { workDir, signal });
  return path.join(workDir, `still_${String(frame).padStart(4, '0')}.png`);
}
