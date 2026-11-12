// Discounts. Prices everywhere else stay the list prices; this file decides what the customer pays.
// The site is static, so a change here (or an offer ending) needs a rebuild to show.

/** Launch offer on every listed price. Set pct to 0 to end it. */
export const launchOffer = {
  pct: 30,
  ends: null, // 'YYYY-MM-DD' (Riyadh) or null for "until announced"
  subscriptionMonths: 3, // monthly plans: the offer covers the first N paid months
  label: { ar: 'خصم الإطلاق', en: 'Launch offer' },
};

/**
 * Promo codes, stored as SHA-256 of the normalized code so the codes cannot be read from the
 * site's JavaScript. Add one with: node scripts/promo-hash.mjs CODE
 * scope: 'sites' (gallery orders), 'social' (monthly social plans) or 'all'.
 * A code applies on top of the launch price; one code per order.
 */
export const promoCodes = [
  { hash: '955ff9265441bef3a6cd682eff5f9201b006a759bdfbe32c3b51056741e39f99', pct: 10, scope: 'all', ends: '2026-12-31' },
];

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

export function normalizeCode(input) {
  return String(input || '')
    .normalize('NFKC')
    .replace(ARABIC_DIGITS, (d) => String((d.charCodeAt(0) & 0xf) % 10))
    .replace(/\s+/g, '')
    .toUpperCase()
    .slice(0, 40);
}

function endOfDay(date) {
  return new Date(`${date}T23:59:59+03:00`);
}

export function offerActive(now = new Date()) {
  return launchOffer.pct > 0 && (!launchOffer.ends || now <= endOfDay(launchOffer.ends));
}

/** Round to the nearest 10 riyals so prices stay clean. */
function cut(amount, pct) {
  return Math.round((amount * (100 - pct)) / 100 / 10) * 10;
}

/** What a listed price costs today. */
export function launchPrice(amount, now = new Date()) {
  return offerActive(now) ? cut(amount, launchOffer.pct) : amount;
}

export function withCode(amount, pct) {
  return pct ? cut(amount, pct) : amount;
}

async function sha256(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Resolve a typed code for a scope. Returns { code, pct } or { error: 'invalid' | 'expired' | 'scope' }. */
export async function checkCode(input, scope, now = new Date()) {
  const code = normalizeCode(input);
  if (code.length < 3) return { error: 'invalid' };
  const hash = await sha256(code);
  const entry = promoCodes.find((c) => c.hash === hash);
  if (!entry) return { error: 'invalid' };
  if (entry.ends && now > endOfDay(entry.ends)) return { error: 'expired' };
  if (entry.scope !== 'all' && entry.scope !== scope) return { error: 'scope' };
  return { code, pct: entry.pct };
}

export const promoText = {
  ar: {
    field: 'كود الخصم',
    placeholder: 'اكتب الكود',
    apply: 'تطبيق',
    remove: 'إزالة',
    ok: (pct) => `تم، خصم إضافي ${pct}%`,
    invalid: 'الكود غير صحيح.',
    expired: 'انتهت صلاحية الكود.',
    scope: 'الكود ما يشمل هذي الخدمة.',
    was: 'بدل',
    launch: (pct) => `خصم الإطلاق ${pct}%`,
    codeLine: (code, pct) => `كود خصم أدخله العميل — يتحقق منه الفريق قبل الدفع: ${code} (${pct}%)`,
    months: (n) => `الخصم على أول ${n} شهور`,
  },
  en: {
    field: 'Promo code',
    placeholder: 'Enter code',
    apply: 'Apply',
    remove: 'Remove',
    ok: (pct) => `Applied: extra ${pct}% off`,
    invalid: 'That code is not valid.',
    expired: 'That code has expired.',
    scope: 'That code does not cover this service.',
    was: 'was',
    launch: (pct) => `Launch offer ${pct}% off`,
    codeLine: (code, pct) => `Promo code entered by the customer — staff must verify before payment: ${code} (${pct}%)`,
    months: (n) => `Discount on the first ${n} months`,
  },
};
