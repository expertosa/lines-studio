import path from 'node:path';

/** Worker mode keeps every byte on the external drive, like the MoneyPrinter worker. */
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
