import { NOMINAL_SIZE, SHOWCASE_SIZE, TEMPLATE_SIZE } from './constants.js';

const VOICES = Object.freeze({
  ar: Object.freeze(['ar-SA-HamedNeural', 'ar-SA-ZariyahNeural']),
  en: Object.freeze(['en-US-JennyNeural', 'en-US-GuyNeural']),
});

const SHARED = Object.freeze({
  formats: Object.freeze(['9:16', '16:9', '1:1']),
  seconds: Object.freeze([15, 30, 60]),
  languages: Object.freeze(['ar', 'en']),
  voices: VOICES,
  defaultVoice: Object.freeze({
    ar: 'ar-SA-HamedNeural',
    en: 'en-US-JennyNeural',
  }),
});

/**
 * Stock styles follow `defaultEngine` (moneyprinter in production, template for a local demo).
 * `template` is the built-in ffmpeg engine and stays local when it is enabled.
 * `blender` (style `promo3d`) is pulled by the Blender worker and is listed only when enabled.
 * `ugc` is pulled by the UGC worker (paid vendor calls) and is listed only when enabled.
 * `showcase` is a local ffmpeg Ken Burns clip pulled by the Mac video worker.
 * `external` is reserved for a future generative vendor and is not listed until configured.
 */
const DEFINITIONS = Object.freeze([
  Object.freeze({
    id: 'promo',
    label: 'Promo',
    engine: 'stock',
    description: 'Short commercial pacing with product and city footage.',
  }),
  Object.freeze({
    id: 'story',
    label: 'Story',
    engine: 'stock',
    description: 'Narrative pacing with cinematic b-roll.',
  }),
  Object.freeze({
    id: 'calm',
    label: 'Calm',
    engine: 'stock',
    description: 'Slower voice and quieter footage.',
  }),
  Object.freeze({
    id: 'template',
    label: 'Template',
    engine: 'template',
    description: 'Built-in ffmpeg title card. For tests and fallback, not a generative video.',
    testOnly: true,
  }),
  Object.freeze({
    id: 'ugc',
    label: 'UGC',
    engine: 'ugc',
    description: 'Selfie-style testimonial: a presenter speaks your script with lip sync. Paid vendor calls on the UGC worker. Requires script.text.',
    // The voice comes from the presenter (metadata.presenter), not from Edge TTS.
    formats: Object.freeze(['9:16']),
    seconds: Object.freeze([15, 30]),
    voices: Object.freeze({ ar: Object.freeze(['presenter']), en: Object.freeze(['presenter']) }),
    defaultVoice: Object.freeze({ ar: 'presenter', en: 'presenter' }),
    requiresScript: true,
  }),
  Object.freeze({
    id: 'promo3d',
    label: 'Promo 3D',
    engine: 'blender',
    description: 'Procedural 3D promo rendered in Blender on the Mac worker (hero mockup, animated lines, brand palette).',
  }),
  Object.freeze({
    id: 'showcase',
    label: 'Showcase',
    engine: 'showcase',
    description: 'Slow Ken Burns move over a supplied screenshot. Vertical 9:16, 6–10 seconds, no text, no logo, no audio. Local ffmpeg on the Mac worker.',
    formats: Object.freeze(['9:16']),
    seconds: Object.freeze([6, 7, 8, 9, 10]),
    voices: Object.freeze({ ar: Object.freeze(['none']), en: Object.freeze(['none']) }),
    defaultVoice: Object.freeze({ ar: 'none', en: 'none' }),
    requiresImage: true,
  }),
]);

const FIXED_ENGINES = new Set(['template', 'blender', 'ugc', 'showcase']);

function engineFor(style, defaultEngine) {
  if (FIXED_ENGINES.has(style.engine)) return style.engine;
  return defaultEngine;
}

export function listStyles({ enableTemplate, enableBlender = false, enableUgc = false, defaultEngine }) {
  return DEFINITIONS.filter((style) => {
    if (style.engine === 'template') return enableTemplate;
    if (style.engine === 'blender') return enableBlender;
    if (style.engine === 'ugc') return enableUgc;
    return true;
  }).map((style) => ({
    id: style.id,
    label: style.label,
    description: style.description,
    engine: engineFor(style, defaultEngine),
    testOnly: Boolean(style.testOnly),
    formats: style.formats || SHARED.formats,
    seconds: style.seconds || SHARED.seconds,
    languages: SHARED.languages,
    voices: style.voices || SHARED.voices,
    defaultVoice: style.defaultVoice || SHARED.defaultVoice,
    requiresScript: Boolean(style.requiresScript),
    requiresImage: Boolean(style.requiresImage),
  }));
}

export function findStyle(id, options) {
  return listStyles(options).find((style) => style.id === id) || null;
}

export function pixelSize(engine, format) {
  const table = engine === 'template' ? TEMPLATE_SIZE : engine === 'showcase' ? SHOWCASE_SIZE : NOMINAL_SIZE;
  return table[format] || null;
}
