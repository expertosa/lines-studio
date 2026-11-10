import { APP_SCOPES } from './constants.js';
import { installAppKey, installWorkerKey } from './keys.js';

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseBootstrap(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('LINES_BOOTSTRAP_KEYS is not valid JSON');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('LINES_BOOTSTRAP_KEYS must be a non-empty array');
  }
  return parsed.map((entry) => {
    if (!plain(entry)) throw new Error('bootstrap entry must be an object');
    const kind = entry.kind || 'app';
    if (kind !== 'app' && kind !== 'worker') throw new Error('bootstrap kind is invalid');
    if (kind === 'worker') {
      return {
        kind,
        id: entry.id,
        token: entry.token,
        engines: entry.engines,
      };
    }
    return {
      kind,
      id: entry.id,
      tenantId: entry.tenantId || entry.id,
      token: entry.token,
      scopes: entry.scopes || [...APP_SCOPES],
      webhookSecret: entry.webhookSecret,
      jobsPerHour: entry.jobsPerHour,
      videoSecondsPerMonth: entry.videoSecondsPerMonth,
    };
  });
}

export function applyBootstrap(store, entries, defaults) {
  for (const entry of entries) {
    if (entry.kind === 'worker') installWorkerKey(store, entry);
    else installAppKey(store, entry, defaults);
  }
}
