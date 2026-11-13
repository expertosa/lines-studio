import { createHash } from 'node:crypto';
import { FORMATS, LANGUAGES, SECONDS } from './constants.js';
import { ApiError } from './errors.js';
import { findStyle, pixelSize } from './styles.js';
import { assertPublicHttps } from './ssrf.js';
import { DEFAULT_TIER, DIALECTS, MAX_SWAPS, SWAP_KINDS, SWAP_PRESETS, TIERS } from './engines/localize.js';

const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

function lengthOf(value) {
  return [...value].length;
}

function problems() {
  const details = [];
  return {
    add(path, code) {
      details.push(Object.assign(Object.create(null), { path, code }));
    },
    finish() {
      if (details.length > 0) {
        throw new ApiError(422, 'validation_error', 'Request is invalid.', details);
      }
    },
    get empty() {
      return details.length === 0;
    },
  };
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function requestHash(canonical) {
  return createHash('sha256').update(JSON.stringify(stable(canonical))).digest('hex');
}

function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function validateJob(body, options) {
  const check = problems();
  if (!plainObject(body)) {
    throw new ApiError(422, 'validation_error', 'Request body must be an object.', [
      Object.assign(Object.create(null), { path: '', code: 'type' }),
    ]);
  }
  const allowed = new Set([
    'reference', 'title', 'prompt', 'script', 'style', 'format', 'language', 'seconds', 'voice', 'callbackUrl', 'metadata', 'localize',
  ]);
  for (const key of Object.keys(body)) {
    if (!allowed.has(key)) check.add(key, 'unknown');
  }
  if (typeof body.reference !== 'string' || !REFERENCE_RE.test(body.reference)) check.add('reference', 'format');
  if (typeof body.title !== 'string' || lengthOf(body.title.trim()) < 1 || lengthOf(body.title) > 140 || CONTROL_RE.test(body.title) || /[\r\n]/.test(body.title)) {
    check.add('title', 'format');
  }
  let prompt = null;
  if (body.prompt !== undefined) {
    if (typeof body.prompt !== 'string' || lengthOf(body.prompt.trim()) < 1 || lengthOf(body.prompt) > 4000 || CONTROL_RE.test(body.prompt)) {
      check.add('prompt', 'format');
    } else {
      prompt = body.prompt.trim();
    }
  }
  let script = null;
  if (body.script !== undefined) {
    script = readScript(body.script, check);
  }
  const style = typeof body.style === 'string' ? findStyle(body.style, options) : null;
  if (!style) check.add('style', 'enum');
  const isLocalize = style?.engine === 'localize';
  // A localization job edits an existing ad, so it needs the localize spec, not a prompt.
  if (!isLocalize && !prompt && !script?.text) check.add('prompt', 'required');
  let localize = null;
  if (isLocalize) {
    if (body.localize === undefined) check.add('localize', 'required');
    else localize = readLocalize(body.localize, check);
  } else if (body.localize !== undefined) {
    check.add('localize', 'unknown');
  }
  if (typeof body.format !== 'string' || !FORMATS.includes(body.format)) check.add('format', 'enum');
  if (typeof body.language !== 'string' || !LANGUAGES.includes(body.language)) check.add('language', 'enum');
  if (!SECONDS.includes(body.seconds)) check.add('seconds', 'enum');
  else if (style && !style.seconds.includes(body.seconds)) check.add('seconds', 'enum');
  if (style && typeof body.format === 'string' && FORMATS.includes(body.format) && !style.formats.includes(body.format)) {
    check.add('format', 'enum');
  }
  if (style?.requiresScript && !script?.text) check.add('script.text', 'required');
  let voice = null;
  if (style && LANGUAGES.includes(body.language)) {
    const choices = style.voices[body.language];
    if (body.voice === undefined) voice = style.defaultVoice[body.language];
    else if (typeof body.voice !== 'string' || !choices.includes(body.voice)) check.add('voice', 'enum');
    else voice = body.voice;
  } else if (body.voice !== undefined && typeof body.voice !== 'string') {
    check.add('voice', 'format');
  }
  let callbackUrl = null;
  if (body.callbackUrl !== undefined) {
    if (typeof body.callbackUrl !== 'string') check.add('callbackUrl', 'format');
    else callbackUrl = body.callbackUrl;
  }
  let metadata = {};
  if (body.metadata !== undefined) metadata = readMetadata(body.metadata, check);
  check.finish();

  let checkedUrl = null;
  if (callbackUrl) {
    const result = await assertPublicHttps(callbackUrl, {
      lookup: options.lookup,
      allowedPorts: options.allowedPorts,
    });
    checkedUrl = result.href;
  }
  if (localize) {
    // The worker downloads these, so they get the same public-https check as callbacks.
    localize.source.url = (await assertPublicHttps(localize.source.url, { lookup: options.lookup })).href;
    for (const swap of localize.swaps) {
      if (swap.referenceUrl) swap.referenceUrl = (await assertPublicHttps(swap.referenceUrl, { lookup: options.lookup })).href;
    }
  }
  const engine = style.engine;
  const size = pixelSize(engine, body.format);
  const canonical = {
    reference: body.reference,
    title: body.title.trim(),
    prompt,
    script,
    style: style.id,
    format: body.format,
    language: body.language,
    seconds: body.seconds,
    voice,
    callbackUrl: checkedUrl,
    metadata,
    ...(localize ? { localize } : {}),
  };
  return {
    ...canonical,
    engine,
    width: size.width,
    height: size.height,
    requestHash: requestHash(canonical),
  };
}

function readScript(value, check) {
  if (!plainObject(value)) {
    check.add('script', 'type');
    return null;
  }
  for (const key of Object.keys(value)) {
    if (key !== 'text' && key !== 'scenes') check.add(`script.${key}`, 'unknown');
  }
  let text = '';
  if (value.text !== undefined) {
    if (typeof value.text !== 'string' || lengthOf(value.text) > 8000 || CONTROL_RE.test(value.text)) {
      check.add('script.text', 'format');
    } else {
      text = value.text.trim();
    }
  }
  const scenes = [];
  if (value.scenes !== undefined) {
    if (!Array.isArray(value.scenes) || value.scenes.length > 12) check.add('script.scenes', 'format');
    else {
      value.scenes.forEach((scene, index) => {
        if (!plainObject(scene)) {
          check.add(`script.scenes[${index}]`, 'type');
          return;
        }
        for (const key of Object.keys(scene)) {
          if (key !== 'text' && key !== 'seconds') check.add(`script.scenes[${index}].${key}`, 'unknown');
        }
        if (typeof scene.text !== 'string' || lengthOf(scene.text.trim()) < 1 || lengthOf(scene.text) > 500 || CONTROL_RE.test(scene.text)) {
          check.add(`script.scenes[${index}].text`, 'format');
        }
        if (scene.seconds !== undefined && (!Number.isInteger(scene.seconds) || scene.seconds < 1 || scene.seconds > 60)) {
          check.add(`script.scenes[${index}].seconds`, 'range');
        }
        if (typeof scene.text === 'string') {
          scenes.push({
            text: scene.text.trim(),
            ...(scene.seconds !== undefined ? { seconds: scene.seconds } : {}),
          });
        }
      });
    }
  }
  if (!text && scenes.length > 0) text = scenes.map((scene) => scene.text).join('\n');
  if (!text) {
    check.add('script.text', 'required');
    return null;
  }
  return { text, scenes };
}

function readMetadata(value, check) {
  if (!plainObject(value)) {
    check.add('metadata', 'type');
    return {};
  }
  const keys = Object.keys(value);
  if (keys.length > 16) check.add('metadata', 'size');
  const metadata = {};
  for (const key of keys) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(key)) {
      check.add(`metadata.${key}`, 'format');
      continue;
    }
    const item = value[key];
    const ok = item === null
      || typeof item === 'boolean'
      || (typeof item === 'number' && Number.isFinite(item))
      || (typeof item === 'string' && lengthOf(item) <= 200 && !CONTROL_RE.test(item));
    if (!ok) check.add(`metadata.${key}`, 'type');
    else metadata[key] = item;
  }
  if (JSON.stringify(metadata).length > 2048) check.add('metadata', 'size');
  return metadata;
}

function httpsString(value) {
  if (typeof value !== 'string' || value.length > 2048 || CONTROL_RE.test(value)) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function shortText(value, max) {
  return typeof value === 'string' && lengthOf(value.trim()) >= 1 && lengthOf(value) <= max && !CONTROL_RE.test(value) && !/[\r\n]/.test(value);
}

function readLocalize(value, check) {
  if (!plainObject(value)) {
    check.add('localize', 'type');
    return null;
  }
  for (const key of Object.keys(value)) {
    if (!['tier', 'source', 'swaps', 'captions', 'dub', 'consent'].includes(key)) check.add(`localize.${key}`, 'unknown');
  }
  const out = { tier: DEFAULT_TIER, source: null, swaps: [], captions: null, dub: false, consent: { likeness: false } };
  if (value.tier !== undefined) {
    if (!TIERS.includes(value.tier)) check.add('localize.tier', 'enum');
    else out.tier = value.tier;
  }

  if (!plainObject(value.source)) check.add('localize.source', 'required');
  else {
    for (const key of Object.keys(value.source)) {
      if (key !== 'url') check.add(`localize.source.${key}`, 'unknown');
    }
    if (!httpsString(value.source.url)) check.add('localize.source.url', 'format');
    else out.source = { url: value.source.url };
  }

  if (value.swaps !== undefined) {
    if (!Array.isArray(value.swaps) || value.swaps.length > MAX_SWAPS) check.add('localize.swaps', 'format');
    else {
      value.swaps.forEach((swap, index) => {
        const at = `localize.swaps[${index}]`;
        if (!plainObject(swap)) {
          check.add(at, 'type');
          return;
        }
        for (const key of Object.keys(swap)) {
          if (!['kind', 'preset', 'target', 'referenceUrl'].includes(key)) check.add(`${at}.${key}`, 'unknown');
        }
        if (!SWAP_KINDS.includes(swap.kind)) {
          check.add(`${at}.kind`, 'enum');
          return;
        }
        const item = { kind: swap.kind };
        if (swap.preset !== undefined) {
          if (!SWAP_PRESETS[swap.kind].includes(swap.preset)) check.add(`${at}.preset`, 'enum');
          else item.preset = swap.preset;
        }
        if (swap.target !== undefined) {
          if (!shortText(swap.target, 200)) check.add(`${at}.target`, 'format');
          else item.target = swap.target.trim();
        }
        if (swap.referenceUrl !== undefined) {
          if (!httpsString(swap.referenceUrl)) check.add(`${at}.referenceUrl`, 'format');
          else item.referenceUrl = swap.referenceUrl;
        }
        // A product swap needs to know which product: a reference image or a description.
        if (!item.preset && !item.target && !item.referenceUrl) check.add(`${at}.target`, 'required');
        out.swaps.push(item);
      });
    }
  }

  if (value.captions !== undefined) {
    if (!plainObject(value.captions)) check.add('localize.captions', 'type');
    else {
      for (const key of Object.keys(value.captions)) {
        if (key !== 'dialect' && key !== 'text') check.add(`localize.captions.${key}`, 'unknown');
      }
      const captions = {};
      if (!DIALECTS.includes(value.captions.dialect)) check.add('localize.captions.dialect', 'enum');
      else captions.dialect = value.captions.dialect;
      if (value.captions.text !== undefined) {
        if (typeof value.captions.text !== 'string' || lengthOf(value.captions.text.trim()) < 1 || lengthOf(value.captions.text) > 2000 || CONTROL_RE.test(value.captions.text)) {
          check.add('localize.captions.text', 'format');
        } else captions.text = value.captions.text.trim();
      }
      out.captions = captions;
    }
  }

  if (value.dub !== undefined) {
    if (typeof value.dub !== 'boolean') check.add('localize.dub', 'type');
    else out.dub = value.dub;
  }
  if (out.dub && !out.captions?.dialect) check.add('localize.captions.dialect', 'required');

  if (value.consent !== undefined) {
    if (!plainObject(value.consent)) check.add('localize.consent', 'type');
    else {
      for (const key of Object.keys(value.consent)) {
        if (key !== 'likeness') check.add(`localize.consent.${key}`, 'unknown');
      }
      if (value.consent.likeness !== undefined && typeof value.consent.likeness !== 'boolean') check.add('localize.consent.likeness', 'type');
      else out.consent.likeness = value.consent.likeness === true;
    }
  }
  // Swapping a person or cloning a voice needs the caller to confirm they hold the rights.
  const touchesPeople = out.swaps.some((swap) => swap.kind === 'character') || out.dub;
  if (touchesPeople && !out.consent.likeness) check.add('localize.consent.likeness', 'required');

  if (out.swaps.length === 0 && !out.captions && !out.dub) check.add('localize.swaps', 'required');
  // Free runs on the Mac mini only: Saudi voice + lip-sync, no visual swaps.
  if (out.tier === 'free') {
    if (out.swaps.length > 0) check.add('localize.swaps', 'tier_unsupported');
    if (!out.dub) check.add('localize.dub', 'required');
  }
  // Gemini video edit takes at most two reference images.
  if (out.tier === 'economy' && out.swaps.filter((swap) => swap.referenceUrl).length > 2) check.add('localize.swaps', 'too_many_references');
  // Free and economy speak a script locally (no machine translation), so the Saudi line must be given.
  if (out.tier !== 'pro' && out.dub && out.captions && !out.captions.text) check.add('localize.captions.text', 'required');
  return out;
}
