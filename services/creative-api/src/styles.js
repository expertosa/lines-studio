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
    id: 'promo3d',
    label: 'Promo 3D',
    engine: 'blender',
    description: 'Procedural 3D promo rendered in Blender on the Mac worker (hero mockup, animated lines, brand palette).',
  }),
]);

function engineFor(style, defaultEngine) {
  if (style.engine === 'template' || style.engine === 'blender') return style.engine;
  return defaultEngine;
}

export function listStyles({ enableTemplate, enableBlender = false, defaultEngine }) {
  return DEFINITIONS.filter((style) => {
    if (style.engine === 'template') return enableTemplate;
    if (style.engine === 'blender') return enableBlender;
    return true;
  }).map((style) => ({
    id: style.id,
    label: style.label,
    description: style.description,
    engine: engineFor(style, defaultEngine),
    testOnly: Boolean(style.testOnly),
    formats: SHARED.formats,
    seconds: SHARED.seconds,
    languages: SHARED.languages,
    voices: SHARED.voices,
    defaultVoice: SHARED.defaultVoice,
  }));
}

export function findStyle(id, options) {
  return listStyles(options).find((style) => style.id === id) || null;
}

export function pixelSize(engine, format) {
  const table = engine === 'template' ? TEMPLATE_SIZE : NOMINAL_SIZE;
  return table[format] || null;
}
