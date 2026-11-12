import net from 'node:net';

function one(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function parseV4(text) {
  if (net.isIP(text) !== 4) return null;
  const parts = text.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => part > 255)) return null;
  const int = ((parts[0] * 16777216) + (parts[1] * 65536) + (parts[2] * 256) + parts[3]) >>> 0;
  return { version: 4, text: parts.join('.'), int };
}

function expandV6(ip) {
  let text = ip.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  if (text.includes('.')) {
    const lastColon = text.lastIndexOf(':');
    if (lastColon === -1) return null;
    const v4 = parseV4(text.slice(lastColon + 1));
    if (!v4) return null;
    const hi = (v4.int >>> 16) & 0xffff;
    const lo = v4.int & 0xffff;
    text = `${text.slice(0, lastColon + 1)}${hi.toString(16)}:${lo.toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parseSide = (side) => {
    if (!side) return [];
    const parts = side.split(':');
    if (parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) return null;
    return parts.map((part) => Number.parseInt(part, 16));
  };
  if (halves.length === 1) {
    const full = parseSide(halves[0]);
    if (!full || full.length !== 8) return null;
    return full;
  }
  const left = parseSide(halves[0]);
  const right = parseSide(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 1) return null;
  return [...left, ...Array(missing).fill(0), ...right];
}

export function parseIp(value) {
  const text = one(value).toLowerCase();
  if (!text) return null;
  const v4 = parseV4(text);
  if (v4) return v4;
  if (net.isIP(text) !== 6) return null;
  const groups = expandV6(text);
  if (!groups || groups.length !== 8) return null;
  const mapped = groups[0] === 0 && groups[1] === 0 && groups[2] === 0
    && groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff;
  if (mapped) {
    const int = ((groups[6] << 16) | groups[7]) >>> 0;
    const dotted = [
      (int >>> 24) & 255,
      (int >>> 16) & 255,
      (int >>> 8) & 255,
      int & 255,
    ].join('.');
    return { version: 4, text: dotted, int };
  }
  return { version: 6, groups };
}

function validIp(value) {
  let trimmed = one(value);
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) trimmed = trimmed.slice(1, -1);
  if (!trimmed || trimmed.length > 64 || !parseIp(trimmed)) return null;
  return trimmed;
}

/** IPv4 stays the full address. IPv6 collapses to /64. IPv4-mapped IPv6 stays the IPv4 address. */
export function rateLimitKey(ip) {
  const parsed = parseIp(ip);
  if (!parsed) return String(ip || 'unknown');
  if (parsed.version === 4) return parsed.text;
  return `6:${parsed.groups.slice(0, 4).map((part) => part.toString(16)).join(':')}`;
}

function samePrefix(ip, base, bits) {
  if (ip.version !== base.version) return false;
  if (ip.version === 4) {
    if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = bits >= 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
    return (ip.int & mask) === (base.int & mask);
  }
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false;
  if (bits === 0) return true;
  let left = bits;
  for (let index = 0; index < 8; index += 1) {
    if (left <= 0) return true;
    const take = Math.min(16, left);
    const shift = 16 - take;
    if ((ip.groups[index] >>> shift) !== (base.groups[index] >>> shift)) return false;
    left -= take;
  }
  return true;
}

function ruleMatches(ip, rule) {
  const text = one(rule);
  if (!text) return false;
  if (!text.includes('/')) {
    const peer = parseIp(ip);
    const expected = parseIp(text);
    if (!peer || !expected || peer.version !== expected.version) return false;
    if (peer.version === 4) return peer.int === expected.int;
    return peer.groups.every((part, index) => part === expected.groups[index]);
  }
  const slash = text.indexOf('/');
  const peer = parseIp(ip);
  const base = parseIp(text.slice(0, slash));
  const bits = Number(text.slice(slash + 1));
  if (!peer || !base || !Number.isInteger(bits)) return false;
  return samePrefix(peer, base, bits);
}

/**
 * Loopback, RFC1918, link-local, CGNAT, and IPv6 ULA. Used when
 * LINES_TRUST_PROXY=1 and LINES_TRUSTED_PROXIES is unset.
 */
export function isTrustedProxyPeer(ip) {
  const parsed = parseIp(ip);
  if (!parsed) return false;
  if (parsed.version === 4) {
    const a = (parsed.int >>> 24) & 255;
    const b = (parsed.int >>> 16) & 255;
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  const [g0, g1, g2, g3, g4, g5, g6, g7] = parsed.groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return true;
  if (g0 >= 0xfe80 && g0 <= 0xfebf) return true;
  if (g0 >= 0xfc00 && g0 <= 0xfdff) return true;
  return false;
}

export function parseTrustedProxies(value) {
  if (value == null) return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  const rules = text.split(',').map((part) => part.trim()).filter(Boolean);
  if (!rules.length) return undefined;
  for (const rule of rules) {
    const slash = rule.indexOf('/');
    if (slash === -1) {
      if (!parseIp(rule)) throw new Error(`LINES_TRUSTED_PROXIES has an invalid entry: ${rule}`);
      continue;
    }
    const base = parseIp(rule.slice(0, slash));
    const bits = Number(rule.slice(slash + 1));
    const max = base?.version === 4 ? 32 : 128;
    if (!base || !Number.isInteger(bits) || bits < 0 || bits > max || rule.slice(slash + 1) !== String(bits)) {
      throw new Error(`LINES_TRUSTED_PROXIES has an invalid entry: ${rule}`);
    }
  }
  return rules;
}

function peerTrusted(socketIp, trustProxy, trustedProxies) {
  if (!trustProxy || socketIp === 'unknown') return false;
  if (Array.isArray(trustedProxies)) return trustedProxies.some((rule) => ruleMatches(socketIp, rule));
  return isTrustedProxyPeer(socketIp);
}

/**
 * Client address for the failed-auth limiter.
 * Forwarded headers count only when trustProxy is on and the TCP peer is a
 * trusted proxy (private/loopback, or trustedProxies when that list is set).
 * Then CF-Connecting-IP, X-Real-IP, and the last X-Forwarded-For hop.
 */
export function clientIp(req, trustProxy, trustedProxies) {
  const socketIp = validIp(req.socket?.remoteAddress) || 'unknown';
  if (!peerTrusted(socketIp, trustProxy, trustedProxies)) return socketIp;
  const headers = req.headers || {};
  const cf = validIp(headers['cf-connecting-ip']);
  if (cf) return cf;
  const real = validIp(headers['x-real-ip']);
  if (real) return real;
  const forwarded = one(headers['x-forwarded-for']);
  if (forwarded) {
    const parts = forwarded.split(',').map((part) => validIp(part)).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return socketIp;
}

export function createAuthLimiter({ limit = 10, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  const keyFor = (ip) => rateLimitKey(ip);
  return {
    check(ip, at) {
      const row = hits.get(keyFor(ip));
      if (!row || row.resetAt <= at || row.count < limit) return null;
      return { retryAfter: Math.max(1, Math.ceil((row.resetAt - at) / 1000)) };
    },
    record(ip, at) {
      const key = keyFor(ip);
      if (hits.size > 10000) {
        for (const [entry, row] of hits) {
          if (row.resetAt <= at) hits.delete(entry);
        }
      }
      let row = hits.get(key);
      if (!row || row.resetAt <= at) {
        row = { count: 0, resetAt: at + windowMs };
        hits.set(key, row);
      }
      row.count += 1;
      if (row.count < limit) return { limited: false };
      return {
        limited: true,
        retryAfter: Math.max(1, Math.ceil((row.resetAt - at) / 1000)),
      };
    },
  };
}
