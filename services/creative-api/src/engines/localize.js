/**
 * Ad localization (style `localize`): take an existing video ad and produce a
 * Saudi version by swapping characters, outfits, products and backgrounds,
 * then optionally translating voice and lips with HeyGen Precision.
 *
 * This API only validates, stores, quotes and queues the job. It never calls
 * a vendor. A pull worker with `--engines localize` (`services/localize-worker`)
 * runs the paid pipeline: Aleph 2.0 (`aleph2`) for visual swaps, then
 * HeyGen Video Translation Precision to `Arabic (Saudi Arabia)` with lip-sync.
 * The style is listed only when LINES_ENABLE_LOCALIZE=1.
 * Vendor URLs and request headers live in the worker, not in this process.
 *
 * Official rates used by the estimator:
 * - Model `aleph2`: 28 credits/sec, 56-credit minimum; credits are $0.01 each.
 *   Input 2–30 seconds. promptText max 1000 characters. Up to 5 keyframes.
 * - HeyGen Precision with lip-sync: $0.025 per source second.
 *   Language names, not ISO codes. Documented Saudi target: "Arabic (Saudi Arabia)".
 */

export const localizeEngine = Object.freeze({
  id: 'localize',
  mode: 'pull',
  configured: true,
  paidCalls: true,
  swapModel: 'aleph2',
  translateModel: 'heygen_precision',
});

export const SWAP_KINDS = Object.freeze(['character', 'outfit', 'product', 'background']);

/** Presets the studio can describe to the worker. Free text `target` is also allowed. */
export const SWAP_PRESETS = Object.freeze({
  character: Object.freeze(['saudi-man', 'saudi-woman', 'saudi-family', 'saudi-youth']),
  outfit: Object.freeze(['thobe-shemagh', 'thobe-ghutra', 'abaya', 'saudi-casual', 'saudi-sport']),
  product: Object.freeze([]),
  background: Object.freeze(['riyadh-boulevard', 'riyadh-kafd', 'jeddah-corniche', 'alula', 'abha', 'saudi-home-majlis', 'saudi-cafe']),
});

/** English phrases for Aleph prompts. The model takes a short instruction, not our preset ids. */
export const SWAP_PROMPT_LABELS = Object.freeze({
  character: Object.freeze({
    'saudi-man': 'a Saudi man',
    'saudi-woman': 'a Saudi woman',
    'saudi-family': 'a Saudi family',
    'saudi-youth': 'a young Saudi adult',
  }),
  outfit: Object.freeze({
    'thobe-shemagh': 'a white thobe and a red-and-white shemagh',
    'thobe-ghutra': 'a white thobe and a white ghutra',
    abaya: 'a black abaya',
    'saudi-casual': 'contemporary Saudi casual wear',
    'saudi-sport': 'Saudi sportswear',
  }),
  product: Object.freeze({}),
  background: Object.freeze({
    'riyadh-boulevard': 'Riyadh Boulevard',
    'riyadh-kafd': 'the King Abdullah Financial District in Riyadh',
    'jeddah-corniche': 'the Jeddah Corniche',
    alula: 'AlUla',
    abha: 'Abha',
    'saudi-home-majlis': 'a Saudi home majlis',
    'saudi-cafe': 'a Saudi cafe',
  }),
});

export const DIALECTS = Object.freeze(['najdi', 'hijazi', 'janoubi', 'sharqawi', 'white']);

export const MAX_SWAPS = 30;

/** Documented HeyGen video-translation target name (not an ISO code). */
export const HEYGEN_SAUDI_LANGUAGE = 'Arabic (Saudi Arabia)';

export const ALEPH_MODEL = 'aleph2';
export const ALEPH_PROMPT_MAX = 1000;
export const ALEPH_MAX_KEYFRAMES = 5;
export const ALEPH_MIN_SECONDS = 2;
export const ALEPH_MAX_SECONDS = 30;
export const VENDOR_CREDIT_USD = 0.01;
export const ALEPH_CREDITS_PER_SEC = 28;
export const ALEPH_MIN_CREDITS = 56;
export const HEYGEN_PRECISION_USD_PER_SEC = 0.025;
export const DEFAULT_LOCALIZE_MAX_USD = 15;

export function localizeMaxUsd(env = process.env) {
  const raw = env.LINES_LOCALIZE_MAX_USD;
  if (raw === undefined || raw === '') return DEFAULT_LOCALIZE_MAX_USD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LOCALIZE_MAX_USD;
  return value;
}

export function swapLabel(swap) {
  if (swap?.target) return String(swap.target).trim();
  const label = SWAP_PROMPT_LABELS[swap?.kind]?.[swap?.preset];
  if (label) return label;
  if (swap?.preset) return String(swap.preset).replace(/-/g, ' ');
  return 'the reference image';
}

export function swapPrompt(swap) {
  const named = swapLabel(swap);
  if (swap.kind === 'character') {
    return swap.referenceUrl
      ? `Replace the on-screen person with the person shown in the reference image (${named}), keeping the same pose, motion, framing and scene.`
      : `Replace the on-screen person with ${named}, keeping the same pose, motion, framing and scene.`;
  }
  if (swap.kind === 'outfit') {
    return `Change the outfit to ${named}. Keep the person, pose, motion and background exactly as they are.`;
  }
  if (swap.kind === 'product') {
    return swap.referenceUrl
      ? `Swap the on-screen product for the one shown in the reference image (${named}). Keep everything else exactly as it is.`
      : `Swap the on-screen product for ${named}. Keep everything else exactly as it is.`;
  }
  if (swap.kind === 'background') {
    return `Change the background to ${named}. Keep the people, products, framing and motion exactly as they are.`;
  }
  return `Apply this edit: ${named}. Keep everything else exactly as it is.`;
}

function passPrompt(parts) {
  if (parts.length === 1) return parts[0];
  return `Apply all of these edits. Keep everything else exactly as it is.\n${parts.map((part, index) => `${index + 1}. ${part}`).join('\n')}`;
}

function keyframeFor(swap) {
  if (!swap.referenceUrl) return null;
  return { uri: swap.referenceUrl, seconds: 0 };
}

/**
 * Pack swaps into as few Aleph requests as the documented limits allow
 * (promptText ≤ 1000 characters, ≤ 5 keyframes). Official docs say many
 * edits can combine in one request; splitting only happens when they cannot.
 */
export function packAlephPasses(swaps = []) {
  const passes = [];
  let parts = [];
  let refs = [];
  let grouped = [];
  const flush = () => {
    if (!grouped.length) return;
    passes.push({
      promptText: passPrompt(parts),
      keyframes: refs.slice(),
      swaps: grouped.slice(),
    });
    parts = [];
    refs = [];
    grouped = [];
  };
  for (const swap of swaps) {
    const line = swapPrompt(swap);
    const frame = keyframeFor(swap);
    const nextParts = parts.concat(line);
    const nextRefs = frame ? refs.concat(frame) : refs;
    const fitsPrompt = passPrompt(nextParts).length <= ALEPH_PROMPT_MAX;
    const fitsFrames = nextRefs.length <= ALEPH_MAX_KEYFRAMES;
    if (grouped.length && (!fitsPrompt || !fitsFrames)) flush();
    parts.push(line);
    if (frame) refs.push(frame);
    grouped.push(swap);
    if (passPrompt(parts).length > ALEPH_PROMPT_MAX) flush();
  }
  flush();
  return passes;
}

export function alephGenerationUsd(seconds) {
  const credits = Math.max(ALEPH_MIN_CREDITS, Number(seconds) * ALEPH_CREDITS_PER_SEC);
  return credits * VENDOR_CREDIT_USD;
}

export function heygenPrecisionUsd(seconds) {
  return Number(seconds) * HEYGEN_PRECISION_USD_PER_SEC;
}

/**
 * Duration-based estimate for a localize job. Aleph generations follow
 * packAlephPasses (usually one call for a typical ad). HeyGen is billed
 * on source duration only when `dub` is true.
 */
export function estimateLocalizeCost({
  seconds,
  swaps = [],
  swapCount,
  dub = false,
  maxUsd,
  env = process.env,
} = {}) {
  const list = Array.isArray(swaps) ? swaps : [];
  const count = list.length || Number(swapCount) || 0;
  const passes = list.length
    ? packAlephPasses(list)
    : (count > 0 ? packAlephPasses(Array.from({ length: count }, () => ({ kind: 'background', preset: 'alula' }))) : []);
  const alephUsd = passes.reduce((sum) => sum + alephGenerationUsd(seconds), 0);
  const heygenUsd = dub ? heygenPrecisionUsd(seconds) : 0;
  const estimateUsd = alephUsd + heygenUsd;
  const capUsd = maxUsd === undefined ? localizeMaxUsd(env) : maxUsd;
  const durationSupported = !(passes.length && (seconds < ALEPH_MIN_SECONDS || seconds > ALEPH_MAX_SECONDS));
  return Object.freeze({
    currency: 'USD',
    estimateUsd,
    capUsd,
    withinCap: durationSupported && estimateUsd <= capUsd,
    durationSupported,
    alephGenerations: passes.length,
    heygen: Boolean(dub),
    language: dub ? HEYGEN_SAUDI_LANGUAGE : null,
    breakdown: Object.freeze({
      aleph: Object.freeze({
        model: ALEPH_MODEL,
        generations: passes.length,
        usdPerSecond: ALEPH_CREDITS_PER_SEC * VENDOR_CREDIT_USD,
        minUsd: ALEPH_MIN_CREDITS * VENDOR_CREDIT_USD,
        usd: alephUsd,
      }),
      heygen: Object.freeze({
        mode: 'precision',
        language: HEYGEN_SAUDI_LANGUAGE,
        usdPerSecond: HEYGEN_PRECISION_USD_PER_SEC,
        usd: heygenUsd,
      }),
    }),
  });
}

export function costForJob(job, env = process.env) {
  const localize = job?.localize;
  if (!localize) return null;
  return estimateLocalizeCost({
    seconds: job.seconds,
    swaps: localize.swaps || [],
    dub: Boolean(localize.dub),
    env,
  });
}
