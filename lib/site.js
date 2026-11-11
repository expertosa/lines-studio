// Business details.
export const site = {
  whatsapp: '966541555511', // international format, no + or spaces
  whatsappDisplay: '\u2066+966 54 155 5511\u2069', // wrapped so it reads left-to-right inside Arabic text
  email: 'studio@experto.sa',
  crNumber: '2052101318',
  domain: 'lines.studio',
  mcpUrl: 'https://mcp.lines.studio/mcp', // the MCP server in mcp/
  updated: '2026-11-11',
  // Self-hosted, cookieless statistics (Umami). Set both at build time (Coolify build variables);
  // when either is empty no script is loaded and the data-umami-event attributes do nothing.
  analytics: {
    src: process.env.NEXT_PUBLIC_ANALYTICS_SRC || '',
    websiteId: process.env.NEXT_PUBLIC_ANALYTICS_ID || '',
  }, // last update of privacy policy and terms
};

export const languages = ['ar', 'en'];

export function other(lang) {
  return lang === 'ar' ? 'en' : 'ar';
}
