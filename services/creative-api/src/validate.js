import { createHash } from 'node:crypto';
import { FORMATS, LANGUAGES, SECONDS } from './constants.js';
import { ApiError } from './errors.js';
import { findStyle, pixelSize } from './styles.js';
import { assertPublicHttps } from './ssrf.js';

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
    'reference', 'title', 'prompt', 'script', 'style', 'format', 'language', 'seconds', 'voice', 'callbackUrl', 'metadata',
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
  if (!prompt && !script?.text) check.add('prompt', 'required');
  const style = typeof body.style === 'string' ? findStyle(body.style, options) : null;
  if (!style) check.add('style', 'enum');
  if (typeof body.format !== 'string' || !FORMATS.includes(body.format)) check.add('format', 'enum');
  if (typeof body.language !== 'string' || !LANGUAGES.includes(body.language)) check.add('language', 'enum');
  if (!SECONDS.includes(body.seconds)) check.add('seconds', 'enum');
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
