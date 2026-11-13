import { spawn } from 'node:child_process';
import path from 'node:path';

export const SHOWCASE_WIDTH = 720;
export const SHOWCASE_HEIGHT = 1280;
export const SHOWCASE_FPS = 30;

/**
 * Slow Ken Burns over a still, with a blurred fill behind it.
 * Zoom and pan are a single cosine cycle so the last frame matches the first.
 * The filter takes no title, script, or logo. There is no audio filter.
 */
export function showcaseFilter(seconds) {
  if (!Number.isInteger(seconds) || seconds < 6 || seconds > 10) {
    throw new Error('showcase duration must be 6 to 10 seconds');
  }
  const frames = seconds * SHOWCASE_FPS;
  const last = frames - 1;
  const turn = `(2*PI*on/${last})`;
  return [
    `[0:v]scale=${SHOWCASE_WIDTH}:${SHOWCASE_HEIGHT}:force_original_aspect_ratio=increase,crop=${SHOWCASE_WIDTH}:${SHOWCASE_HEIGHT},gblur=sigma=28,eq=brightness=-0.06:saturation=0.85[bg]`,
    `[0:v]scale=${SHOWCASE_WIDTH - 40}:${SHOWCASE_HEIGHT - 80}:force_original_aspect_ratio=decrease:force_divisible_by=2[fg]`,
    `[bg][fg]overlay=(W-w)/2:(H-h)/2,format=rgb24,zoompan=z='1+0.05*(1-cos${turn})':x='iw/2-(iw/zoom/2)+16*sin${turn}':y='ih/2-(ih/zoom/2)+10*sin${turn}':d=${frames}:s=${SHOWCASE_WIDTH}x${SHOWCASE_HEIGHT}:fps=${SHOWCASE_FPS},format=yuv420p[v]`,
  ].join(';');
}

function cancelled() {
  const error = new Error('cancelled');
  error.code = 'cancelled';
  error.retry = false;
  return error;
}

export function renderShowcaseFile({ ffmpeg = 'ffmpeg', imagePath, outputPath, seconds, signal }) {
  const frames = seconds * SHOWCASE_FPS;
  const args = [
    '-y',
    '-hide_banner',
    '-loglevel', 'error',
    '-loop', '1',
    '-i', imagePath,
    '-filter_complex', showcaseFilter(seconds),
    '-map', '[v]',
    '-an',
    '-frames:v', String(frames),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outputPath,
  ];
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const child = spawn(ffmpeg, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      signal,
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        TMPDIR: path.dirname(outputPath),
        LANG: 'C.UTF-8',
      },
    });
    child.stderr.on('data', () => {});
    child.on('error', (error) => {
      if (error.code === 'ABORT_ERR' || signal?.aborted) {
        reject(cancelled());
        return;
      }
      const failed = new Error('ffmpeg could not be started');
      failed.code = 'render_failed';
      failed.retry = false;
      reject(failed);
    });
    child.on('close', (code) => {
      if (signal?.aborted) {
        reject(cancelled());
        return;
      }
      if (code !== 0) {
        const failed = new Error('ffmpeg exited with an error');
        failed.code = 'render_failed';
        failed.retry = false;
        reject(failed);
        return;
      }
      resolve({ frames, width: SHOWCASE_WIDTH, height: SHOWCASE_HEIGHT });
    });
  });
}
