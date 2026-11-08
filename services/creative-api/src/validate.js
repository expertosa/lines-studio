import { createHash } from 'node:crypto';
import { HARD } from './constants.js';
import { ApiError } from './errors.js';

const PRESETS = new Set(HARD.presets.map(([width, height]) => `${width}x${height}`));
const TEXT = /^[\p{L}\p{M}\p{N} .,!?؟،؛'"“”‘’()\-&+,]+$/u;
const BIDI = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\uFEFF]/u;
const URLISH = /https?:|www\.|javascript:|data:|file:|ftp:|[\\/:]/i;

const VIDEO_KEYS = new Set([
  'kind',
  'locale',
  'headline',
  'subline',
  'callToAction',
  'brandName',
  'width',
  'height',
  'durationMs',
  'backgroundColor',
  'foregroundColor',
]);

const STILL_KEYS = new Set([
  'kind',
  'locale',
  'headline',
  'subline',
  'callToAction',
  'brandName',
  'width',
  'height',
  'backgroundColor',
  'foregroundColor',
]);

const PUBLISH_KEYS = new Set([
  'publish',
  'publishAt',
  'published',
  'adAccountId',
  'accountId',
  'accessToken',
  'refreshToken',
  'oauth',
  'oauthToken',
  'campaign',
  'campaignId',
  'adsetId',
  'adId',
  'pageId',
  'platform',
  'destinationUrl',
  'mediaUrl',
  'imageUrl',
  'videoUrl',
  'sourceUrl',
  'callbackUrl',
  'webhookUrl',
  'externalUrl',
  'clickUrl',
  'landingUrl',
  'budget',
  'spend',
  'dailyBudget',
]);

function safeField(name) {
  return /^[A-Za-z][A-Za-z0-9]{0,40}$/.test(name) ? name : 'body';
}

function checkText(value, { path, min, max, required }, details) {
  if (value === undefined || value === null || value === '') {
    if (required) details.push({ path, code: 'empty' });
    return '';
  }
  if (typeof value !== 'string') {
    details.push({ path, code: 'type' });
    return '';
  }
  const text = value.trim();
  const length = [...text].length;
  if (required && length < min) details.push({ path, code: 'empty' });
  if (!required && length === 0) return '';
  if (length > max) details.push({ path, code: 'too_long' });
  if (URLISH.test(text)) {
    details.push({ path, code: 'url_rejected' });
    return text;
  }
  if (BIDI.test(text) || /[\p{C}]/u.test(text) || !TEXT.test(text)) {
    details.push({ path, code: 'bad_charset' });
  }
  return text;
}

function checkColor(value, path, details) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) {
    details.push({ path, code: 'format' });
    return '#000000';
  }
  return value.toLowerCase();
}

function channel(hex, offset) {
  const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

export function contrastRatio(background, foreground) {
  const left = luminance(background);
  const right = luminance(foreground);
  const [hi, lo] = left >= right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonicalize(value[key]);
    return out;
  }
  return value;
}

export function requestHash(brief) {
  return createHash('sha256').update(JSON.stringify(canonicalize(brief))).digest('hex');
}

export function validateBrief(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ApiError(422, 'validation_error', 'Request body must be an object.', [{ path: '', code: 'type' }]);
  }
  const keys = Object.keys(input);
  if (keys.some((key) => PUBLISH_KEYS.has(key))) {
    throw new ApiError(
      422,
      'publish_not_supported',
      'Ad publishing is not available. This service only prepares a creative for admin review.',
    );
  }
  const details = [];
  const kind = input.kind;
  if (kind !== 'video' && kind !== 'ad_creative') {
    details.push({ path: 'kind', code: 'enum' });
  }
  const allowed = kind === 'ad_creative' ? STILL_KEYS : VIDEO_KEYS;
  for (const key of keys) {
    if (!allowed.has(key)) details.push({ path: safeField(key), code: 'unknown_field' });
  }
  if (kind !== 'video' && kind !== 'ad_creative') {
    throw new ApiError(422, 'validation_error', 'Request fields are invalid.', details);
  }
  if (input.locale !== 'ar' && input.locale !== 'en') details.push({ path: 'locale', code: 'enum' });

  const headline = checkText(input.headline, { path: 'headline', min: 1, max: 80, required: true }, details);
  const subline = checkText(input.subline, { path: 'subline', min: 0, max: 120, required: false }, details);
  const callToAction = checkText(input.callToAction, { path: 'callToAction', min: 0, max: 40, required: false }, details);
  const brandName = checkText(input.brandName, { path: 'brandName', min: 1, max: 40, required: true }, details);

  let width;
  let height;
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || !PRESETS.has(`${input.width}x${input.height}`)) {
    details.push({ path: 'width', code: 'preset' });
    details.push({ path: 'height', code: 'preset' });
    width = 0;
    height = 0;
  } else {
    width = input.width;
    height = input.height;
  }

  let durationMs = null;
  if (kind === 'video') {
    if (!Number.isInteger(input.durationMs) || input.durationMs < HARD.minDurationMs || input.durationMs > HARD.maxDurationMs) {
      details.push({ path: 'durationMs', code: 'range' });
    } else {
      durationMs = input.durationMs;
    }
  }

  const backgroundColor = checkColor(input.backgroundColor, 'backgroundColor', details);
  const foregroundColor = checkColor(input.foregroundColor, 'foregroundColor', details);
  if (!details.some((item) => item.path === 'backgroundColor' || item.path === 'foregroundColor')) {
    if (contrastRatio(backgroundColor, foregroundColor) < 3) {
      details.push({ path: 'foregroundColor', code: 'low_contrast' });
    }
  }

  if (details.length > 0) {
    throw new ApiError(422, 'validation_error', 'Request fields are invalid.', details);
  }

  return {
    kind,
    locale: input.locale,
    headline,
    subline,
    callToAction,
    brandName,
    width,
    height,
    ...(kind === 'video' ? { durationMs } : {}),
    backgroundColor,
    foregroundColor,
  };
}

export function timeoutFor(brief) {
  if (brief.kind === 'ad_creative') return Math.min(HARD.maxTimeoutMs, 15_000);
  return Math.min(HARD.maxTimeoutMs, brief.durationMs * 4 + 8_000);
}
