import path from 'node:path';

export const DATA_VOLUME = '/Volumes/Data';

export function assertOnDataVolume(target) {
  if (typeof target !== 'string' || !path.isAbsolute(target)) {
    throw new Error('path must be an absolute path on /Volumes/Data');
  }
  const resolved = path.resolve(target);
  if (resolved !== DATA_VOLUME && !resolved.startsWith(`${DATA_VOLUME}${path.sep}`)) {
    throw new Error(`${target} must live on /Volumes/Data`);
  }
  return resolved;
}

export function isInside(parent, child) {
  const root = path.resolve(parent);
  const abs = path.resolve(child);
  return abs === root || abs.startsWith(`${root}${path.sep}`);
}

/**
 * MoneyPrinterTurbo returns either an HTTP path on its own API or, if the
 * task directory is on the shared drive, an absolute file path. Never fetch
 * any other host.
 */
export function resolveVideoRef(videoRef, { mptBase, workerRoot }) {
  if (typeof videoRef !== 'string' || videoRef.length === 0) {
    throw new Error('MoneyPrinterTurbo did not return a video');
  }
  if (videoRef.startsWith(`${DATA_VOLUME}/`) || videoRef === DATA_VOLUME) {
    const file = assertOnDataVolume(videoRef);
    if (!isInside(workerRoot, file)) throw new Error('video path is outside the worker root');
    return { kind: 'file', file };
  }
  let base;
  try {
    base = new URL(mptBase);
  } catch {
    throw new Error('MPT_BASE_URL is invalid');
  }
  const url = new URL(videoRef, base);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.host !== base.host) {
    throw new Error('video URL is not on the MoneyPrinterTurbo host');
  }
  return { kind: 'url', url: url.href };
}
