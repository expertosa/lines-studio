// Business details.
export const site = {
  whatsapp: '966541555511', // international format, no + or spaces
  whatsappDisplay: '\u2066+966 54 155 5511\u2069', // wrapped so it reads left-to-right inside Arabic text
  email: 'studio@experto.sa',
  crNumber: '2052101318',
  domain: 'lines.studio',
  updated: '2026-11-07', // last update of privacy policy and terms
};

export const languages = ['ar', 'en'];

export function other(lang) {
  return lang === 'ar' ? 'en' : 'ar';
}
