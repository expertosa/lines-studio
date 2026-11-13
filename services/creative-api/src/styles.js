import { NOMINAL_SIZE, TEMPLATE_SIZE } from './constants.js';

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
    id: 'localize',
    label: 'Ad localization',
    engine: 'localize',
    description: 'Saudi version of an existing video ad: Aleph 2.0 swaps characters, outfits, products and backgrounds, then HeyGen Precision translates to Arabic (Saudi Arabia) with lip-sync when dub is set. Requires the localize spec. Paid vendor calls run on the localize worker.',
    requiresLocalize: true,
  }),
]);

function engineFor(style, defaultEngine) {
  if (style.engine === 'template' || style.engine === 'blender' || style.engine === 'ugc' || style.engine === 'localize') return style.engine;
  return defaultEngine;
}

export function listStyles({ enableTemplate, enableBlender = false, enableUgc = false, enableLocalize = false, defaultEngine }) {
  return DEFINITIONS.filter((style) => {
    if (style.engine === 'template') return enableTemplate;
    if (style.engine === 'blender') return enableBlender;
    if (style.engine === 'ugc') return enableUgc;
    if (style.engine === 'localize') return enableLocalize;
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
    requiresLocalize: Boolean(style.requiresLocalize),
  }));
}

export function findStyle(id, options) {
  return listStyles(options).find((style) => style.id === id) || null;
}

export function pixelSize(engine, format) {
  const table = engine === 'template' ? TEMPLATE_SIZE : NOMINAL_SIZE;
  return table[format] || null;
}
