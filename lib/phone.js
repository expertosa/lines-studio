const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizePhone(value) {
  return String(value ?? '')
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(ARABIC_DIGITS.indexOf(digit)))
    .replace(/[\s\-().]/g, '');
}

// Saudi mobile: 05xxxxxxxx, +9665xxxxxxxx, 009665xxxxxxxx, or 9665xxxxxxxx.
export function isSaudiMobile(value) {
  return /^(?:\+966|00966|966|0)5\d{8}$/.test(normalizePhone(value));
}
