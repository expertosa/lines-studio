import net from 'node:net';

function one(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function validIp(value) {
  const trimmed = one(value);
  if (!trimmed || trimmed.length > 64 || net.isIP(trimmed) === 0) return null;
  return trimmed;
}

/**
 * Client address for the failed-auth limiter.
 * trustProxy is for a process that is only reachable through Coolify / Cloudflare:
 * CF-Connecting-IP, then X-Real-IP, then the last X-Forwarded-For hop.
 */
export function clientIp(req, trustProxy) {
  const socketIp = validIp(req.socket?.remoteAddress) || 'unknown';
  if (!trustProxy) return socketIp;
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
  return {
    check(ip, at) {
      const row = hits.get(ip);
      if (!row || row.resetAt <= at || row.count < limit) return null;
      return { retryAfter: Math.max(1, Math.ceil((row.resetAt - at) / 1000)) };
    },
    record(ip, at) {
      if (hits.size > 10000) {
        for (const [key, row] of hits) {
          if (row.resetAt <= at) hits.delete(key);
        }
      }
      let row = hits.get(ip);
      if (!row || row.resetAt <= at) {
        row = { count: 0, resetAt: at + windowMs };
        hits.set(ip, row);
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
