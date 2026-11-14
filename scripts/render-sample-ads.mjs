// Draw the 50 sample ads as 9:16 posters and short silent mp4s.
// node scripts/render-sample-ads.mjs
// Optional: LIMIT=2 node scripts/render-sample-ads.mjs

import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(path.join(root, 'lib/sample-ads.json'), 'utf8'));
const outDir = path.join(root, 'public/ads');
const tmp = path.join(root, '.ad-frames');
const limit = Number(process.env.LIMIT || 0);
const chrome = process.env.CHROME || 'google-chrome-stable';

const cats = new Set(['restaurant', 'cafe', 'perfume', 'abaya', 'estate', 'clinic', 'shop', 'app', 'gym', 'event']);
const ids = new Set();
if (data.ads.length !== 50) throw new Error(`expected 50 ads, got ${data.ads.length}`);
for (const ad of data.ads) {
  if (ids.has(ad.id)) throw new Error(`duplicate id ${ad.id}`);
  ids.add(ad.id);
  if (!cats.has(ad.cat)) throw new Error(`bad cat ${ad.id}`);
  for (const key of ['brand', 'hook', 'script', 'caption', 'cta']) {
    if (!ad[key]?.ar || !ad[key]?.en) throw new Error(`missing ${key} on ${ad.id}`);
  }
}
for (const id of data.featured) {
  if (!ids.has(id)) throw new Error(`featured missing ${id}`);
}

const palettes = [
  { bg: '#111111', fg: '#ffffff', accent: '#d4ff3f', ink: '#111111', mute: '#c8b6ff' },
  { bg: '#111111', fg: '#ffffff', accent: '#ff6b4a', ink: '#111111', mute: '#d4ff3f' },
  { bg: '#111111', fg: '#ffffff', accent: '#c8b6ff', ink: '#111111', mute: '#d4ff3f' },
  { bg: '#fafaf7', fg: '#111111', accent: '#111111', ink: '#d4ff3f', mute: '#ff6b4a' },
  { bg: '#c8b6ff', fg: '#111111', accent: '#111111', ink: '#d4ff3f', mute: '#ffffff' },
  { bg: '#ff6b4a', fg: '#111111', accent: '#111111', ink: '#d4ff3f', mute: '#ffffff' },
];

const motifs = {
  plate: '<circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="60" cy="60" r="18" fill="currentColor"/>',
  cup: '<path d="M28 28 h52 v36 a26 26 0 0 1-52 0z" fill="none" stroke="currentColor" stroke-width="8"/><path d="M80 40 h14 a16 16 0 0 1 0 28 H80" fill="none" stroke="currentColor" stroke-width="8"/><path d="M40 16 q8-14 8 0 M58 16 q8-14 8 0" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
  bottle: '<path d="M48 14 h24 v16 l14 22 v54 a16 16 0 0 1-16 16 H50 a16 16 0 0 1-16-16 V52 l14-22z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>',
  drape: '<path d="M24 18 h72 v10 c-8 40-14 70-36 86 c-22-16-28-46-36-86z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>',
  tower: '<rect x="22" y="28" width="28" height="78" rx="4" fill="currentColor"/><rect x="56" y="14" width="34" height="92" rx="4" fill="none" stroke="currentColor" stroke-width="8"/><rect x="66" y="32" width="8" height="8" fill="currentColor"/><rect x="66" y="50" width="8" height="8" fill="currentColor"/>',
  plus: '<circle cx="60" cy="60" r="46" fill="none" stroke="currentColor" stroke-width="8"/><path d="M60 34 v52 M34 60 h52" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>',
  bag: '<path d="M30 40 h60 l-6 64 H36z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/><path d="M44 40 v-8 a16 16 0 0 1 32 0 v8" fill="none" stroke="currentColor" stroke-width="8"/>',
  phone: '<rect x="34" y="12" width="52" height="96" rx="12" fill="none" stroke="currentColor" stroke-width="8"/><rect x="46" y="24" width="28" height="48" rx="4" fill="currentColor"/>',
  bar: '<rect x="16" y="50" width="88" height="12" rx="6" fill="currentColor"/><rect x="8" y="34" width="18" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="8"/><rect x="94" y="34" width="18" height="44" rx="6" fill="none" stroke="currentColor" stroke-width="8"/>',
  ticket: '<path d="M18 36 h84 v18 a10 10 0 0 0 0 20 v18 H18 v-18 a10 10 0 0 0 0-20z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/>',
};

function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hookSize(text) {
  const n = [...text].length;
  if (n > 34) return 52;
  if (n > 24) return 60;
  return 72;
}

function frameHtml(ad, beat, palette) {
  const motif = motifs[ad.motif] || motifs.plate;
  const size = hookSize(ad.hook.ar);
  const second = beat === 'cta';
  const captionSize = [...ad.caption.ar].length > 48 ? 36 : 42;
  const bg = second ? palette.accent : palette.bg;
  const fg = second ? palette.ink : palette.fg;
  const accent = second ? palette.bg : palette.accent;
  const accentFg = second ? palette.fg : palette.ink;
  const body = second ? ad.caption.ar : ad.hook.ar;
  const bodySize = second ? captionSize : size;
  return `<!doctype html>
<html lang="ar" dir="rtl">
<meta charset="utf-8">
<style>
  html, body { margin: 0; width: 720px; height: 1280px; overflow: hidden; background: ${bg}; color: ${fg}; }
  body { font-family: "Noto Kufi Arabic", "Noto Naskh Arabic", sans-serif; display: flex; flex-direction: column; justify-content: space-between; padding: 64px 56px 72px; box-sizing: border-box; }
  .pill { align-self: flex-start; background: ${accent}; color: ${accentFg}; font-weight: 700; font-size: 28px; border-radius: 999px; padding: 12px 22px; }
  .motif { width: 168px; height: 168px; color: ${second ? palette.bg : palette.accent}; }
  .motif svg { width: 168px; height: 168px; display: block; }
  h1 { margin: 0; font-size: 40px; font-weight: 700; letter-spacing: 0; }
  p { margin: 0; font-size: ${bodySize}px; font-weight: 800; line-height: 1.35; }
  .cta { align-self: flex-start; max-width: 100%; background: ${second ? palette.bg : palette.accent}; color: ${second ? palette.fg : palette.ink}; font-size: ${second ? 36 : 28}px; font-weight: 800; line-height: 1.35; border-radius: 28px; padding: 16px 28px; }
  .en { font-family: "DejaVu Sans", sans-serif; font-size: 22px; font-weight: 700; opacity: .8; direction: ltr; text-align: left; }
</style>
<body>
  <div class="pill">نموذج · Sample</div>
  <div class="motif" aria-hidden="true"><svg viewBox="0 0 120 120">${motif}</svg></div>
  <h1>${esc(ad.brand.ar)}</h1>
  <p>${esc(body)}</p>
  <div class="cta">${esc(second ? ad.cta.ar : ad.hook.en)}</div>
  <div class="en">${esc(second ? ad.cta.en : ad.brand.en)}</div>
</body>
</html>`;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${code}: ${err.slice(-500)}`));
    });
  });
}

async function pool(items, size, worker) {
  const queue = items.slice();
  const runners = Array.from({ length: size }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

const ads = limit > 0 ? data.ads.slice(0, limit) : data.ads;

await rm(tmp, { recursive: true, force: true });
await mkdir(tmp, { recursive: true });
await mkdir(outDir, { recursive: true });

const jobs = [];
for (const [index, ad] of ads.entries()) {
  const palette = palettes[index % palettes.length];
  for (const beat of ['hook', 'cta']) {
    const file = path.join(tmp, `${ad.id}-${beat}.html`);
    await writeFile(file, frameHtml(ad, beat, palette));
    jobs.push({ ad, beat, file, png: path.join(tmp, `${ad.id}-${beat}.png`) });
  }
}

console.log(`screenshots ${jobs.length}`);
await pool(jobs, 3, async (job) => {
  await run(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--window-size=720,1280',
    `--screenshot=${job.png}`,
    `file://${job.file}`,
  ]);
});

console.log(`video ${ads.length}`);
await pool(ads, 3, async (ad) => {
  const hook = path.join(tmp, `${ad.id}-hook.png`);
  const cta = path.join(tmp, `${ad.id}-cta.png`);
  const mp4 = path.join(outDir, `${ad.id}.mp4`);
  const webp = path.join(outDir, `${ad.id}.webp`);
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-loop', '1', '-t', '2.15', '-i', hook,
    '-loop', '1', '-t', '2.35', '-i', cta,
    '-filter_complex', '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=12,format=yuv420p[a];[1:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=12,format=yuv420p[b];[a][b]xfade=transition=fade:duration=0.35:offset=1.8,format=yuv420p[v]',
    '-map', '[v]', '-an',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'veryfast',
    '-movflags', '+faststart',
    mp4,
  ]);
  await run('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', hook,
    '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280',
    '-c:v', 'libwebp', '-quality', '68',
    webp,
  ]);
  console.log(ad.id);
});

await rm(tmp, { recursive: true, force: true });
console.log('done', ads.length);
