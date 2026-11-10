import { createHmac, timingSafeEqual } from 'node:crypto';

export function hmacHex(secret, payload) {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function signaturesEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Hex HMAC of `timestamp.body` — the bytes that were sent, prefixed by the unix timestamp. */
export function webhookSignature(secret, timestamp, rawBody) {
  return `sha256=${hmacHex(secret, `${timestamp}.${rawBody}`)}`;
}

export function artifactSignature(signingKey, exp, jobId, artifactId) {
  return hmacHex(signingKey, `${exp}.${jobId}.${artifactId}`);
}

export function signedArtifactPath(signingKey, jobId, artifactId, exp) {
  const sig = artifactSignature(signingKey, exp, jobId, artifactId);
  return `/v1/jobs/${jobId}/artifacts/${artifactId}?exp=${exp}&sig=${sig}`;
}
