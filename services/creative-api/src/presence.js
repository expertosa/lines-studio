/** In-memory record of the last successful worker poll or heartbeat. */
export function createPresence() {
  const seen = new Map();
  return {
    note(keyId, engines, at) {
      if (!keyId) return;
      seen.set(keyId, { engines: Array.isArray(engines) ? engines : [], at });
    },
    online(engine, at, windowMs) {
      for (const entry of seen.values()) {
        if (!entry.engines.includes(engine)) continue;
        if (at - entry.at <= windowMs) return true;
      }
      return false;
    },
  };
}
