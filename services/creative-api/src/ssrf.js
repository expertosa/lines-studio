import { lookup as dnsLookup } from 'node:dns/promises';
import net from 'node:net';
import { ApiError } from './errors.js';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.google',
]);

function detail(code) {
  return [Object.assign(Object.create(null), { path: 'callbackUrl', code })];
}

export function isBlockedHostname(hostname) {
  const host = String(hostname || '').replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (!host || BLOCKED_HOSTS.has(host)) return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return true;
  return false;
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

async function defaultLookup(hostname) {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

/**
 * HTTPS callback URLs only. Blocks loopback, private, link-local, and
 * hostnames that resolve to those ranges. Callers must connect to the
 * returned address (pinned lookup) so a later DNS answer cannot rebind.
 */
export async function assertPublicHttps(raw, { lookup = defaultLookup, allowedPorts = new Set([443]) } = {}) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 500) {
    throw new ApiError(422, 'ssrf_blocked', 'callbackUrl is not allowed.', detail('ssrf'));
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(422, 'ssrf_blocked', 'callbackUrl is not allowed.', detail('ssrf'));
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new ApiError(422, 'ssrf_blocked', 'callbackUrl must be https with no user info.', detail('ssrf'));
  }
  const port = Number(url.port || 443);
  if (!allowedPorts.has(port)) {
    throw new ApiError(422, 'ssrf_blocked', 'callbackUrl port is not allowed.', detail('ssrf'));
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(host)) {
    throw new ApiError(422, 'ssrf_blocked', 'callbackUrl host is not allowed.', detail('ssrf'));
  }
  let addresses;
  if (net.isIP(host)) {
    addresses = [host];
  } else {
    try {
      addresses = await lookup(host);
    } catch {
      throw new ApiError(422, 'ssrf_blocked', 'callbackUrl host did not resolve.', detail('dns'));
    }
  }
  if (!Array.isArray(addresses) || addresses.length === 0 || addresses.some((address) => isPrivateAddress(address))) {
    throw new ApiError(422, 'ssrf_blocked', 'callbackUrl resolves to a blocked address.', detail('ssrf'));
  }
  return { href: url.href, host, addresses };
}
