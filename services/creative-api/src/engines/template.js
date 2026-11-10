import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CodedError } from '../errors.js';
import { cleanProcessEnv } from '../process-env.js';

const ARABIC_FONTS = [
  ['/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf', 'Noto Naskh Arabic'],
  ['/usr/share/fonts/noto/NotoNaskhArabic-Regular.ttf', 'Noto Naskh Arabic'],
  ['/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf', 'Noto Sans Arabic'],
  ['/usr/share/fonts/noto/NotoSansArabic-Regular.ttf', 'Noto Sans Arabic'],
];

const LATIN_FONTS = [
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
  ['/usr/share/fonts/dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
  ['/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
];

export function resolveFont(candidates, overridePath, overrideFamily) {
  if (overridePath) {
    if (!overrideFamily || !fs.existsSync(overridePath)) return null;
    return { file: overridePath, family: overrideFamily };
  }
  for (const [file, family] of candidates) {
    if (fs.existsSync(file)) return { file, family };
  }
  return null;
}

function assEscape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\r?\n/g, ' ');
}

function assTime(ms) {
  const totalCs = Math.max(0, Math.round(ms / 10));
  const cs = totalCs % 100;
  const totalSeconds = Math.floor(totalCs / 100);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function escapeFilterPath(filePath) {
  return filePath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

export function buildAss(job, family) {
  const durationMs = job.seconds * 1000;
  const scale = job.height / 360;
  const end = assTime(durationMs);
  const fill = '&H00EAF3F7';
  const style = (name, size, align, marginV) =>
    `Style: ${name},${family},${size},${fill},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,${align},28,28,${marginV},1`;
  const line = (styleName, text) => `Dialogue: 0,0:00:00.00,${end},${styleName},,0,0,0,,${assEscape(text)}`;
  const body = (job.script?.text || job.prompt || '').slice(0, 180);
  const brand = job.language === 'ar' ? 'اكسبرتو' : 'Lines Studio';
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${job.width}`,
    `PlayResY: ${job.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Brand', Math.max(16, Math.round(18 * scale)), 8, Math.round(24 * scale)),
    style('Head', Math.max(22, Math.round(32 * scale)), 5, 0),
    style('Sub', Math.max(14, Math.round(16 * scale)), 2, Math.round(72 * scale)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    line('Brand', brand),
    line('Head', job.title),
    body ? line('Sub', body) : null,
    '',
  ].filter(Boolean).join('\n');
}

function probeBinary(bin) {
  return new Promise((resolve) => {
    const child = spawn(bin, ['-version'], { env: cleanProcessEnv(), stdio: 'ignore' });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 4000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

function runFfmpeg(ffmpeg, args, { signal, workDir }) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, {
      env: cleanProcessEnv({ TMPDIR: workDir }),
      signal,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    child.stderr.on('data', () => {});
    child.on('error', (error) => {
      if (error.code === 'ABORT_ERR' || signal?.aborted) {
        reject(abortError(signal));
        return;
      }
      reject(new CodedError('RENDER_FAILED', 'ffmpeg could not be started'));
    });
    child.on('close', (code) => {
      if (signal?.aborted) {
        reject(abortError(signal));
        return;
      }
      if (code !== 0) {
        reject(new CodedError('RENDER_FAILED', 'ffmpeg exited with an error'));
        return;
      }
      resolve();
    });
  });
}

function abortError(signal) {
  const reason = signal?.reason;
  if (reason === 'timeout') return new CodedError('RENDER_TIMEOUT', 'Render timed out.');
  if (reason === 'cancel' || reason === 'shutdown') return new CodedError('CANCELLED', 'Cancelled.');
  return new CodedError('RENDER_FAILED', 'Render aborted.');
}

export function createTemplateEngine(options = {}) {
  const ffmpeg = options.ffmpegPath || 'ffmpeg';
  const ffprobe = options.ffprobePath || 'ffprobe';
  const state = { ready: false };

  return {
    id: 'template',
    mode: 'local',
    configured: true,
    paidCalls: false,
    ffmpeg,
    ffprobe,
    get ready() {
      return state.ready;
    },
    async check() {
      const bin = await probeBinary(ffmpeg);
      const probe = await probeBinary(ffprobe);
      state.ready = bin && probe;
      return state.ready;
    },
    async render(job, ctx) {
      const arabic = job.language === 'ar' || /[\u0600-\u06FF]/.test(`${job.title}\n${job.prompt || ''}`);
      const font = arabic
        ? resolveFont(ARABIC_FONTS, options.arabicFont, options.arabicFamily)
        : resolveFont(LATIN_FONTS, options.latinFont, options.latinFamily);
      if (!font) throw new CodedError('FONT_UNAVAILABLE', 'Required font is not installed.');
      const assPath = path.join(ctx.workDir, 'card.ass');
      const output = path.join(ctx.workDir, 'card.mp4');
      fs.writeFileSync(assPath, buildAss(job, font.family), 'utf8');
      const filter = [
        `drawbox=x=0:y=0:w=${job.width}:h=${Math.round(job.height * 0.18)}:color=0xE8C872:t=fill`,
        `ass=${escapeFilterPath(assPath)}:fontsdir=${escapeFilterPath(path.dirname(font.file))}`,
      ].join(',');
      await runFfmpeg(ffmpeg, [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', `color=c=0x102A43:s=${job.width}x${job.height}:d=${job.seconds}:r=8`,
        '-vf', filter,
        '-an',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '30',
        '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart',
        output,
      ], { signal: ctx.signal, workDir: ctx.workDir });
      if (ctx.signal?.aborted) throw abortError(ctx.signal);
      return { filePath: output, mime: 'video/mp4' };
    },
  };
}
