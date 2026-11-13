import { lookup as dnsLookup } from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';

const WORK_PATH = /^\/work\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(webp|png|jpe?g)$/i;
const ARTIFACT_PATH = /^\/v1\/jobs\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/artifacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_HOSTS = ['lines.studio', 'www.lines.studio', 'api.lines.studio'];
const MAX_BYTES = 12 * 1024 * 1024;

export function hostSet(extra = (process.env.LINES_IMAGE_HOSTS || '').split(',')) {
  const hosts = new Set(DEFAULT_HOSTS);
  for (const item of extra) {
    const name = String(item || '').trim().toLowerCase().replace(/\.$/, '');
    if (!name || name.length > 253 || net.isIP(name)) continue;
    if (name === 'localhost' || name.endsWith('.localhost') || name.endsWith('.local') || name.endsWith('.internal')) continue;
    if (!/^[a-z0-9.-]+$/.test(name) || name.startsWith('.') || name.includes('..')) continue;
    hosts.add(name);
  }
  return hosts;
}

function fail(message, retry) {
  const error = new Error(message);
  error.code = message === 'cancelled' ? 'cancelled' : 'render_failed';
  error.retry = retry;
  return error;
}

function ipv4Parts(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const numbers = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
  if (numbers.some((part) => !Number.isInteger(part) || part > 255)) return null;
  return numbers;
}

export function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) {
    const [a, b] = ipv4Parts(address) || [];
    if (a === undefined) return true;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a >= 224) return true;
    return false;
  }
  if (family === 6) {
    const value = address.toLowerCase();
    if (value === '::' || value === '::1') return true;
    if (value.startsWith('fe80:') || value.startsWith('fc') || value.startsWith('fd')) return true;
    if (value.startsWith('::ffff:')) {
      const mapped = value.slice('::ffff:'.length);
      if (net.isIP(mapped) === 4) return isPrivateAddress(mapped);
    }
    return false;
  }
  return true;
}

/**
 * Same allowlist as the API: lines.studio work stills and this API's artifact URLs.
 * Keep the path rules aligned with services/creative-api/src/image-url.js.
 */
export function parseShowcaseImageUrl(raw, hosts = hostSet()) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
  if (url.port && url.port !== '443') return null;
  const host = url.hostname.replace(/\.$/, '').toLowerCase();
  if (!hosts.has(host) || net.isIP(host)) return null;
  const work = WORK_PATH.test(url.pathname);
  const artifact = ARTIFACT_PATH.test(url.pathname);
  if (!work && !artifact) return null;
  if (work && url.search) return null;
  if (artifact) {
    for (const key of url.searchParams.keys()) {
      if (key !== 'exp' && key !== 'sig') return null;
    }
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    if (exp != null && !/^\d{1,12}$/.test(exp)) return null;
    if (sig != null && !/^[a-f0-9]{16,128}$/i.test(sig)) return null;
  }
  const clean = new URL(`https://${host}${url.pathname}`);
  if (artifact) {
    const exp = url.searchParams.get('exp');
    const sig = url.searchParams.get('sig');
    if (exp) clean.searchParams.set('exp', exp);
    if (sig) clean.searchParams.set('sig', sig.toLowerCase());
  }
  return { href: clean.href, host };
}

export function sniffImage(bytes) {
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return null;
}

async function defaultLookup(hostname) {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

function header(response, name) {
  if (typeof response.headers?.get === 'function') return response.headers.get(name) || '';
  return response.headers?.[name] || '';
}

export async function downloadShowcaseImage(raw, destination, { fetchImpl, lookup = defaultLookup, signal } = {}) {
  const parsed = parseShowcaseImageUrl(raw);
  if (!parsed) throw fail('image URL is not allowed', false);
  if (signal?.aborted) throw fail('cancelled', false);
  let addresses;
  try {
    addresses = await lookup(parsed.host);
  } catch {
    throw fail('image host did not resolve', true);
  }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw fail('image host is not allowed', false);
  }
  const timeout = AbortSignal.timeout(20_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(parsed.href, {
      redirect: 'manual',
      signal: requestSignal,
      headers: { accept: 'image/webp,image/png,image/jpeg' },
    });
  } catch {
    if (signal?.aborted) throw fail('cancelled', false);
    throw fail('image download failed', true);
  }
  if (response.status >= 300 && response.status < 400) throw fail('redirect refused', false);
  if (!response.ok) throw fail('image download failed', response.status >= 500 || response.status === 429);
  const type = String(header(response, 'content-type')).toLowerCase();
  if (type.includes('svg') || type.startsWith('text/') || type.includes('html')) {
    throw fail('image type is not allowed', false);
  }
  const declared = Number(header(response, 'content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) throw fail('image is too large', false);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 32 || bytes.length > MAX_BYTES || !sniffImage(bytes)) {
    throw fail('image is not a webp, png, or jpeg', false);
  }
  fs.writeFileSync(destination, bytes);
  return { href: parsed.href, bytes: bytes.length };
}
