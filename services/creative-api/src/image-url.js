import net from 'node:net';
import { ApiError } from './errors.js';
import { isBlockedHostname } from './ssrf.js';

const WORK_PATH = /^\/work\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(webp|png|jpe?g)$/i;
const ARTIFACT_PATH = /^\/v1\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/artifacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public hosts the Mac worker may download a showcase still from. */
export const DEFAULT_IMAGE_HOSTS = Object.freeze([
  'lines.studio',
  'www.lines.studio',
  'api.lines.studio',
]);

function detail(code) {
  return [Object.assign(Object.create(null), { path: 'imageUrl', code })];
}

function reject(message, code) {
  throw new ApiError(422, 'ssrf_blocked', message, detail(code));
}

export function imageHostSet(extra = []) {
  const hosts = new Set(DEFAULT_IMAGE_HOSTS);
  for (const item of extra) {
    const name = String(item || '').trim().toLowerCase().replace(/\.$/, '');
    if (!name || name.length > 253 || net.isIP(name) || isBlockedHostname(name)) continue;
    if (!/^[a-z0-9.-]+$/.test(name) || name.startsWith('.') || name.includes('..')) continue;
    hosts.add(name);
  }
  return hosts;
}

/**
 * Showcase stills may only be an https file on lines.studio (`/work/<id>.webp`)
 * or an artifact this API already stored (`/v1/jobs/<id>/artifacts/<id>`).
 * The API does not fetch the URL. The Mac worker fetches it and refuses redirects.
 */
export function assertShowcaseImageUrl(raw, { hosts = DEFAULT_IMAGE_HOSTS } = {}) {
  const allowed = hosts instanceof Set ? hosts : imageHostSet(hosts);
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) {
    reject('imageUrl is not allowed.', 'format');
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    reject('imageUrl is not allowed.', 'format');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    reject('imageUrl must be https with no user info.', 'ssrf');
  }
  if (url.port && url.port !== '443') {
    reject('imageUrl port is not allowed.', 'ssrf');
  }
  if (url.hash) reject('imageUrl is not allowed.', 'format');
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!host || net.isIP(host) || isBlockedHostname(host) || !allowed.has(host)) {
    reject('imageUrl host is not allowed.', 'ssrf');
  }
  const work = WORK_PATH.test(url.pathname);
  const artifact = ARTIFACT_PATH.test(url.pathname);
  if (!work && !artifact) reject('imageUrl path is not allowed.', 'ssrf');
  if (work && url.search) reject('imageUrl is not allowed.', 'format');
  if (artifact) {
    for (const key of url.searchParams.keys()) {
      if (key !== 'exp' && key !== 'sig') reject('imageUrl is not allowed.', 'format');
    }
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    if (exp != null && !/^\d{1,12}$/.test(exp)) reject('imageUrl is not allowed.', 'format');
    if (sig != null && !/^[a-f0-9]{16,128}$/i.test(sig)) reject('imageUrl is not allowed.', 'format');
  }
  const clean = new URL(`${url.protocol}//${host}${url.pathname}`);
  if (artifact) {
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    if (exp) clean.searchParams.set('exp', exp);
    if (sig) clean.searchParams.set('sig', sig.toLowerCase());
  }
  return { href: clean.href, host };
}
