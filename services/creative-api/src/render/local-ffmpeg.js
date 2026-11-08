import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { CodedError } from '../errors.js';

const ARABIC_FONTS = [
  ['/usr/share/fonts/truetype/noto/NotoNaskhArabic-Regular.ttf', 'Noto Naskh Arabic'],
  ['/usr/share/fonts/noto/NotoNaskhArabic-Regular.ttf', 'Noto Naskh Arabic'],
  ['/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf', 'Noto Sans Arabic'],
];

const LATIN_FONTS = [
  ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
  ['/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
  ['/usr/share/fonts/dejavu/DejaVuSans.ttf', 'DejaVu Sans'],
];

export function cleanProcessEnv(extra = {}) {
  return {
    PATH: process.env.PATH || '/usr/bin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    ...extra,
  };
}

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

function needsArabic(brief) {
  const text = `${brief.headline}\n${brief.subline}\n${brief.callToAction}\n${brief.brandName}`;
  return brief.locale === 'ar' || /[\u0600-\u06FF]/.test(text);
}

function assEscape(text) {
  return text.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

function assColor(hex) {
  const red = hex.slice(1, 3);
  const green = hex.slice(3, 5);
  const blue = hex.slice(5, 7);
  return `&H00${blue}${green}${red}`.toUpperCase();
}

function assTime(ms) {
  const clamped = Math.max(0, ms);
  const totalCs = Math.round(clamped / 10);
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

export function buildAss(brief, family) {
  const durationMs = brief.kind === 'video' ? brief.durationMs : 1000;
  const scale = brief.height / 360;
  const brandSize = Math.max(16, Math.round(22 * scale));
  const headSize = Math.max(28, Math.round(46 * scale));
  const subSize = Math.max(16, Math.round(22 * scale));
  const fill = assColor(brief.foregroundColor);
  const end = assTime(durationMs);
  const style = (name, size, align, marginV) =>
    `Style: ${name},${family},${size},${fill},&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,${align},48,48,${marginV},1`;
  const line = (styleName, text) =>
    `Dialogue: 0,0:00:00.00,${end},${styleName},,0,0,0,,${assEscape(text)}`;
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${brief.width}`,
    `PlayResY: ${brief.height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Brand', brandSize, 8, Math.round(28 * scale)),
    style('Head', headSize, 5, 0),
    style('Sub', subSize, 2, Math.round(108 * scale)),
    style('Cta', subSize, 2, Math.round(42 * scale)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    line('Brand', brief.brandName),
    line('Head', brief.headline),
    brief.subline ? line('Sub', brief.subline) : null,
    brief.callToAction ? line('Cta', brief.callToAction) : null,
    '',
  ].filter(Boolean).join('\n');
}

function runFfmpeg(ffmpeg, args, { signal, workDir }) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, args, {
      env: cleanProcessEnv({ TMPDIR: workDir }),
      signal,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const stderr = [];
    let stderrLen = 0;
    child.stderr.on('data', (chunk) => {
      stderrLen += chunk.length;
      if (stderrLen <= 2048) stderr.push(chunk);
    });
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

export function createLocalProvider(options = {}) {
  const ffmpeg = options.ffmpegPath || 'ffmpeg';
  const ffprobe = options.ffprobePath || 'ffprobe';
  const state = { ready: false, reason: 'not_checked' };

  async function check() {
    const bin = await probeBinary(ffmpeg);
    const probe = await probeBinary(ffprobe);
    state.ready = bin && probe;
    state.reason = state.ready ? null : 'ffmpeg_missing';
    return state.ready;
  }

  return {
    name: 'local-ffmpeg',
    generative: false,
    paidCalls: false,
    check,
    get ready() {
      return state.ready;
    },
    reason() {
      return state.reason;
    },
    ffmpeg,
    ffprobe,
    async render(job, ctx) {
      const brief = job.brief;
      const arabic = needsArabic(brief);
      const font = arabic
        ? resolveFont(ARABIC_FONTS, options.arabicFont, options.arabicFamily)
        : resolveFont(LATIN_FONTS, options.latinFont, options.latinFamily);
      if (!font) throw new CodedError('FONT_UNAVAILABLE', 'Required font is not installed.');
      const assPath = path.join(ctx.workDir, 'card.ass');
      const output = path.join(ctx.workDir, brief.kind === 'video' ? 'card.mp4' : 'card.png');
      fs.writeFileSync(assPath, buildAss(brief, font.family), 'utf8');
      const color = brief.backgroundColor.slice(1);
      const duration = brief.kind === 'video' ? (brief.durationMs / 1000).toFixed(3) : '1';
      const filter = `ass=${escapeFilterPath(assPath)}:fontsdir=${escapeFilterPath(path.dirname(font.file))}`;
      const args = [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-f', 'lavfi',
        '-i', `color=c=0x${color}:s=${brief.width}x${brief.height}:d=${duration}:r=30`,
        '-vf', filter,
        '-an',
      ];
      if (brief.kind === 'video') {
        args.push(
          '-c:v', 'libx264',
          '-preset', 'veryfast',
          '-pix_fmt', 'yuv420p',
          '-movflags', '+faststart',
          output,
        );
      } else {
        args.push('-frames:v', '1', output);
      }
      await runFfmpeg(ffmpeg, args, { signal: ctx.signal, workDir: ctx.workDir });
      if (ctx.signal?.aborted) throw abortError(ctx.signal);
      return {
        filePath: output,
        mime: brief.kind === 'video' ? 'video/mp4' : 'image/png',
      };
    },
  };
}

function probeBinary(bin) {
  try {
    const child = spawn(bin, ['-version'], {
      env: cleanProcessEnv(),
      stdio: 'ignore',
    });
    return new Promise((resolve) => {
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
  } catch {
    return Promise.resolve(false);
  }
}

export function createDisabledProvider() {
  return {
    name: 'disabled',
    generative: false,
    paidCalls: false,
    ready: false,
    check() {
      return false;
    },
    reason() {
      return 'disabled';
    },
    async render() {
      throw new CodedError('PROVIDER_UNAVAILABLE', 'Creative provider is disabled.');
    },
  };
}
