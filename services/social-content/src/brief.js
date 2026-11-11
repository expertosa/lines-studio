/**
 * A client brief for one month of social content. Packages fix the volume;
 * the brief carries what only the client knows (offer, voice, things to avoid).
 */
export const PLATFORMS = Object.freeze(['instagram', 'tiktok', 'snapchat', 'x', 'linkedin']);

/** Monthly volume per subscription package (mirrors lib/social.js on the site). */
export const PACKAGES = Object.freeze({
  content: Object.freeze({ platforms: 2, posts: 12, reels: 0, storiesPerWeek: 0 }),
  basic: Object.freeze({ platforms: 2, posts: 12, reels: 2, storiesPerWeek: 3 }),
  growth: Object.freeze({ platforms: 3, posts: 20, reels: 4, storiesPerWeek: 5 }),
  full: Object.freeze({ platforms: 4, posts: 30, reels: 8, storiesPerWeek: 7 }),
});

const DIALECTS = ['saudi', 'msa'];

function fail(message) {
  throw Object.assign(new Error(message), { code: 'invalid_brief' });
}

function text(value, field, max, required = true) {
  if (value == null || value === '') {
    if (required) fail(`${field} is required`);
    return '';
  }
  if (typeof value !== 'string') fail(`${field} must be text`);
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length > max) fail(`${field} is longer than ${max} characters`);
  return clean;
}

function list(value, field, maxItems, maxLength) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > maxItems) fail(`${field} must be a list of at most ${maxItems}`);
  return value.map((item, i) => text(item, `${field}[${i}]`, maxLength));
}

export function parseBrief(input) {
  if (!input || typeof input !== 'object') fail('brief must be an object');
  const pkgId = input.package || 'basic';
  const pkg = PACKAGES[pkgId];
  if (!pkg) fail(`package must be one of ${Object.keys(PACKAGES).join(', ')}`);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(input.month || ''))) fail('month must be YYYY-MM');
  const platforms = list(input.platforms || ['instagram', 'tiktok'], 'platforms', 5, 20);
  for (const p of platforms) if (!PLATFORMS.includes(p)) fail(`unknown platform ${p}`);
  if (platforms.length === 0) fail('pick at least one platform');
  if (platforms.length > pkg.platforms) fail(`package ${pkgId} covers ${pkg.platforms} platforms`);
  const dialect = input.dialect || 'saudi';
  if (!DIALECTS.includes(dialect)) fail(`dialect must be ${DIALECTS.join(' or ')}`);
  const language = input.language || 'ar';
  if (!['ar', 'en'].includes(language)) fail('language must be ar or en');
  const occasions = (input.occasions || []).map((o, i) => {
    if (!o || !/^\d{4}-\d{2}-\d{2}$/.test(String(o.date || ''))) fail(`occasions[${i}].date must be YYYY-MM-DD`);
    return { date: o.date, name: text(o.name, `occasions[${i}].name`, 60) };
  });
  return {
    package: pkgId,
    volume: { ...pkg },
    month: input.month,
    business: text(input.business, 'business', 80),
    sector: text(input.sector, 'sector', 60),
    city: text(input.city, 'city', 40, false),
    about: text(input.about, 'about', 800),
    audience: text(input.audience, 'audience', 300, false),
    offers: list(input.offers, 'offers', 8, 160),
    voice: text(input.voice, 'voice', 200, false),
    avoid: list(input.avoid, 'avoid', 10, 120),
    hashtags: list(input.hashtags, 'hashtags', 10, 40),
    website: text(input.website, 'website', 120, false),
    platforms,
    dialect,
    language,
    occasions,
  };
}
