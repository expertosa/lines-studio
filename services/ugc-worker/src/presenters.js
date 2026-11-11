import fs from 'node:fs';
import path from 'node:path';

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const IMAGE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpe?g|webp)$/i;
const VOICE_RE = /^[A-Za-z0-9]{10,40}$/;

/**
 * presenters.json (in the presenters folder on the worker):
 * { "default": "yousef",
 *   "presenters": [{ "id": "yousef", "name": "…", "image": "yousef.png",
 *                    "voiceId": "<ElevenLabs voice id>", "languages": ["ar"], "prompt": "…" }] }
 * Images are file names inside the same folder. Jobs pick one with metadata.presenter.
 */
export function loadPresenters(dir, { readFile = fs.readFileSync, exists = fs.existsSync } = {}) {
  const raw = JSON.parse(readFile(path.join(dir, 'presenters.json'), 'utf8'));
  const list = Array.isArray(raw?.presenters) ? raw.presenters : [];
  const byId = new Map();
  for (const item of list) {
    if (!ID_RE.test(item?.id || '')) throw new Error(`presenter id is invalid: ${item?.id}`);
    if (!IMAGE_RE.test(item.image || '')) throw new Error(`presenter ${item.id}: image must be a file name in the presenters folder`);
    if (!VOICE_RE.test(item.voiceId || '')) throw new Error(`presenter ${item.id}: voiceId is invalid`);
    const image = path.join(dir, item.image);
    if (!exists(image)) throw new Error(`presenter ${item.id}: ${item.image} is missing`);
    byId.set(item.id, {
      id: item.id,
      name: String(item.name || item.id).slice(0, 80),
      image,
      voiceId: item.voiceId,
      languages: Array.isArray(item.languages) ? item.languages.filter((l) => l === 'ar' || l === 'en') : ['ar', 'en'],
      prompt: typeof item.prompt === 'string' ? item.prompt.slice(0, 500) : '',
    });
  }
  if (byId.size === 0) throw new Error('presenters.json lists no presenters');
  const fallback = byId.has(raw.default) ? raw.default : [...byId.keys()][0];
  return {
    ids: [...byId.keys()],
    pick(requested, language) {
      const id = typeof requested === 'string' && requested ? requested : fallback;
      const presenter = byId.get(id);
      if (!presenter) {
        throw Object.assign(new Error(`unknown presenter "${String(id).slice(0, 40)}"`), { code: 'presenter_unknown', retry: false });
      }
      if (!presenter.languages.includes(language)) {
        throw Object.assign(new Error(`presenter "${id}" does not speak ${language}`), { code: 'presenter_language', retry: false });
      }
      return presenter;
    },
  };
}

export function mimeFor(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}
