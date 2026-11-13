/**
 * Ad localization (style `localize`): take an existing video ad and produce a
 * Saudi version by swapping characters, outfits, products and backgrounds,
 * with Saudi-dialect captions and an optional dub.
 *
 * This API only validates, stores and queues the job. A pull worker with
 * `--engines localize` renders it. No such worker exists yet: the swap step
 * needs a video model and none is connected, free or paid. The style is listed
 * only when LINES_ENABLE_LOCALIZE=1, so jobs never queue silently.
 * This process never calls a vendor.
 */
export const localizeEngine = Object.freeze({
  id: 'localize',
  mode: 'pull',
  configured: true,
  paidCalls: false,
  swapModel: 'not_connected',
});

export const SWAP_KINDS = Object.freeze(['character', 'outfit', 'product', 'background']);

/** Presets the studio can describe to the worker. Free text `target` is also allowed. */
export const SWAP_PRESETS = Object.freeze({
  character: Object.freeze(['saudi-man', 'saudi-woman', 'saudi-family', 'saudi-youth']),
  outfit: Object.freeze(['thobe-shemagh', 'thobe-ghutra', 'abaya', 'saudi-casual', 'saudi-sport']),
  product: Object.freeze([]),
  background: Object.freeze(['riyadh-boulevard', 'riyadh-kafd', 'jeddah-corniche', 'alula', 'abha', 'saudi-home-majlis', 'saudi-cafe']),
});

export const DIALECTS = Object.freeze(['najdi', 'hijazi', 'janoubi', 'sharqawi', 'white']);

export const MAX_SWAPS = 30;
