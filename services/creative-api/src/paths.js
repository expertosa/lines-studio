import path from 'node:path';

export function safeJoin(root, rel) {
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, rel);
  if (abs !== absRoot && !abs.startsWith(absRoot + path.sep)) {
    throw new Error('path_escape');
  }
  return abs;
}

export function isInside(parent, child) {
  const root = path.resolve(parent);
  const abs = path.resolve(child);
  return abs === root || abs.startsWith(root + path.sep);
}
