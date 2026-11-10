/**
 * Turn a brief (CLI JSON) or a claimed Lines API job into the render spec
 * that blender/promo3d.py and src/overlay.js both read.
 */

export const SIZES = Object.freeze({
  '9:16': Object.freeze({ width: 1080, height: 1920 }),
  '16:9': Object.freeze({ width: 1920, height: 1080 }),
  '1:1': Object.freeze({ width: 1080, height: 1080 }),
});

export const HEROES = Object.freeze(['phone', 'laptop', 'orb']);
export const QUALITIES = Object.freeze(['draft', 'final']);
export const RENDER_ENGINES = Object.freeze(['eevee', 'cycles', 'workbench']);
export const MIDDLE_SHOTS = Object.freeze(['orbit', 'close', 'detail']);

/** Lines Studio house palette. */
export const DEFAULT_PALETTE = Object.freeze({
  background: '#0B1F33',
  primary: '#E8C872',
  accent: '#4FD1C5',
  text: '#F7F3EA',
});

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpe?g|webp)$/i;
const MAX_SCENES = 6;

function clean(text, max) {
  return String(text || '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** "#0B1F33,#E8C872,#4FD1C5[,#F7F3EA]" or an object -> palette. Invalid entries keep the default. */
export function parsePalette(value) {
  const palette = { ...DEFAULT_PALETTE };
  const keys = ['background', 'primary', 'accent', 'text'];
  if (typeof value === 'string') {
    value.split(',').map((item) => item.trim()).forEach((item, index) => {
      if (keys[index] && HEX_RE.test(item)) palette[keys[index]] = item.toUpperCase();
    });
  } else if (value && typeof value === 'object') {
    for (const name of keys) {
      if (typeof value[name] === 'string' && HEX_RE.test(value[name])) palette[name] = value[name].toUpperCase();
    }
  }
  return palette;
}

/** Split narration into at most `max` captions on sentence or line breaks. */
export function splitCaptions(text, max = 4) {
  const parts = String(text || '')
    .split(/\r?\n|(?<=[.!؟?،])\s+/u)
    .map((part) => clean(part, 160))
    .filter(Boolean);
  if (parts.length <= max) return parts;
  const size = Math.ceil(parts.length / max);
  const merged = [];
  for (let i = 0; i < parts.length; i += size) merged.push(parts.slice(i, i + size).join(' '));
  return merged;
}

/**
 * Lay captions on a timeline that ends with a branded outro.
 * Requested scene seconds are honoured proportionally; the outro keeps ~25% (min 3s).
 */
export function timeline(captions, seconds, requested = []) {
  const outroLength = Math.max(3, Math.round(seconds * 0.25));
  const body = Math.max(1, seconds - outroLength);
  const items = captions.slice(0, MAX_SCENES - 1);
  const weights = items.map((_, index) => {
    const asked = requested[index];
    return Number.isFinite(asked) && asked > 0 ? asked : 1;
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const scenes = [];
  let cursor = 0;
  items.forEach((text, index) => {
    const length = index === items.length - 1 ? body - cursor : (body * weights[index]) / total;
    const end = Math.round((cursor + length) * 100) / 100;
    scenes.push({
      text,
      start: Math.round(cursor * 100) / 100,
      end,
      shot: index === 0 ? 'reveal' : MIDDLE_SHOTS[(index - 1) % MIDDLE_SHOTS.length],
    });
    cursor = end;
  });
  if (scenes.length === 0) {
    scenes.push({ text: '', start: 0, end: body, shot: 'reveal' });
    cursor = body;
  }
  scenes.push({ text: '', start: cursor, end: seconds, shot: 'outro' });
  return scenes;
}

function seedFrom(text) {
  let hash = 7;
  for (const char of String(text)) hash = (hash * 31 + char.codePointAt(0)) % 100_000;
  return hash;
}

function detectLanguage(...texts) {
  return /[؀-ۿ]/.test(texts.join(' ')) ? 'ar' : 'en';
}

/**
 * Brief shape (all optional except title):
 * { title, tagline, captions: [..] | narration, format, seconds, language,
 *   palette, hero: "phone" | { type, image, focus 0..1 }, brand, cta, quality, renderEngine, fps, seed }
 * `baseDir` resolves a relative hero image path (CLI only).
 */
export function fromBrief(brief, { resolveImage = (p) => p } = {}) {
  if (!brief || typeof brief !== 'object') throw new Error('brief must be an object');
  const title = clean(brief.title, 140);
  if (!title) throw new Error('brief.title is required');
  const format = SIZES[brief.format] ? brief.format : '16:9';
  const seconds = Number.isInteger(brief.seconds) && brief.seconds >= 5 && brief.seconds <= 120 ? brief.seconds : 15;
  const fps = [24, 25, 30, 60].includes(brief.fps) ? brief.fps : 30;
  const heroInput = typeof brief.hero === 'string' ? { type: brief.hero } : (brief.hero || {});
  const heroType = HEROES.includes(heroInput.type) ? heroInput.type : (format === '16:9' ? 'laptop' : 'phone');
  const captions = Array.isArray(brief.captions)
    ? brief.captions.map((item) => clean(typeof item === 'string' ? item : item?.text, 160)).filter(Boolean)
    : splitCaptions(brief.narration || brief.tagline || '');
  const requested = Array.isArray(brief.captions) ? brief.captions.map((item) => Number(item?.seconds)) : [];
  const tagline = clean(brief.tagline, 160);
  const language = brief.language === 'ar' || brief.language === 'en'
    ? brief.language
    : detectLanguage(title, tagline, ...captions);
  return {
    version: 1,
    title,
    tagline,
    brand: clean(brief.brand, 60) || (language === 'ar' ? 'خطوط ستوديو' : 'Lines Studio'),
    cta: clean(brief.cta, 80),
    language,
    format,
    ...SIZES[format],
    fps,
    seconds,
    palette: parsePalette(brief.palette),
    hero: {
      type: heroType,
      image: heroInput.image ? resolveImage(heroInput.image) : null,
      focus: Number.isFinite(heroInput.focus) ? Math.min(1, Math.max(0, heroInput.focus)) : (language === 'ar' ? 0.85 : 0.5),
    },
    scenes: timeline(captions, seconds, requested),
    quality: QUALITIES.includes(brief.quality) ? brief.quality : 'draft',
    renderEngine: RENDER_ENGINES.includes(brief.renderEngine) ? brief.renderEngine : 'eevee',
    seed: Number.isInteger(brief.seed) ? brief.seed : seedFrom(title),
  };
}

/**
 * Map a claimed `promo3d` job from the Lines video API.
 * Optional job.metadata: palette ("#bg,#primary,#accent[,#text]"), hero, heroAsset
 * (a file name inside the worker's assets directory — never a URL), brand, cta.
 */
export function fromJob(job, { assetsDir = null, quality = 'final' } = {}) {
  if (!job || job.engine !== 'blender') throw new Error('this worker only renders blender jobs');
  const meta = job.metadata || {};
  let image = null;
  if (assetsDir && typeof meta.heroAsset === 'string' && ASSET_RE.test(meta.heroAsset)) {
    image = `${assetsDir.replace(/\/$/, '')}/${meta.heroAsset}`;
  }
  const scenes = job.script?.scenes?.length ? job.script.scenes : null;
  return fromBrief({
    title: job.title,
    tagline: scenes ? '' : (job.script?.text || job.prompt || ''),
    captions: scenes || undefined,
    format: job.format,
    seconds: job.seconds,
    language: job.language,
    palette: meta.palette,
    hero: { type: meta.hero, image },
    brand: meta.brand,
    cta: meta.cta,
    quality,
  });
}
