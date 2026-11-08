// Arabic-capable Google Fonts, picked and paired by the studio.
// Every family here has real Arabic glyphs (not a Latin font with fallback).

export const fonts = [
  { family: 'Alexandria', role: 'display', weights: [500, 700, 800, 900], latin: true, mood: ['bold', 'modern', 'tech'],
    note: { ar: 'خط عناوين عريض وحديث، نستخدمه في هوية خطوط.', en: 'Bold modern headline face; the Lines Studio display font.' } },
  { family: 'Readex Pro', role: 'both', weights: [300, 400, 500, 600, 700], latin: true, mood: ['clean', 'tech', 'friendly'],
    note: { ar: 'عائلة وحدة للعربي والإنجليزي، ممتازة للتطبيقات ولوحات التحكم.', en: 'One family for Arabic + Latin; great for apps and dashboards.' } },
  { family: 'IBM Plex Sans Arabic', role: 'body', weights: [300, 400, 500, 600, 700], latin: true, mood: ['corporate', 'clean', 'serious'],
    note: { ar: 'نص طويل مريح، رسمي، مناسب للشركات والجهات.', en: 'Comfortable long-form text; formal, corporate.' } },
  { family: 'Rubik', role: 'body', weights: [400, 500, 600, 700], latin: true, mood: ['friendly', 'modern'],
    note: { ar: 'خط نص ودود بزوايا ناعمة، نص موقع خطوط.', en: 'Friendly rounded body face; Lines Studio body font.' } },
  { family: 'Tajawal', role: 'body', weights: [400, 500, 700, 800], latin: true, mood: ['friendly', 'clean', 'retail'],
    note: { ar: 'شائع ومقروء، مناسب للمتاجر والمطاعم.', en: 'Popular and legible; good for stores and restaurants.' } },
  { family: 'Cairo', role: 'both', weights: [400, 600, 700, 800, 900], latin: true, mood: ['bold', 'retail', 'friendly'],
    note: { ar: 'عريض وواضح، يشتغل للعناوين والنص. انتبه من كثرة استخدامه.', en: 'Wide and clear; works for both. Very common, use with intent.' } },
  { family: 'Almarai', role: 'body', weights: [300, 400, 700, 800], latin: false, mood: ['clean', 'corporate', 'health'],
    note: { ar: 'هادي ونظيف، ممتاز للعيادات والخدمات.', en: 'Calm and clean; ideal for clinics and services.' } },
  { family: 'Noto Kufi Arabic', role: 'display', weights: [400, 600, 700, 800, 900], latin: false, mood: ['heritage', 'serious', 'bold'],
    note: { ar: 'كوفي هندسي للعناوين، فيه طابع عربي واضح.', en: 'Geometric Kufi for headlines with a clear Arabic character.' } },
  { family: 'Noto Naskh Arabic', role: 'body', weights: [400, 500, 600, 700], latin: false, mood: ['heritage', 'editorial', 'islamic'],
    note: { ar: 'نسخ كلاسيكي للمقالات والمحتوى الديني والتحريري.', en: 'Classic Naskh for articles, editorial and Islamic content.' } },
  { family: 'Amiri', role: 'display', weights: [400, 700], latin: true, mood: ['heritage', 'luxury', 'islamic', 'editorial'],
    note: { ar: 'نسخ فاخر للعناوين، مناسب للفخامة والمحتوى التراثي.', en: 'Elegant Naskh for headlines; luxury and heritage.' } },
  { family: 'Reem Kufi', role: 'display', weights: [400, 500, 600, 700], latin: true, mood: ['heritage', 'cafe', 'luxury'],
    note: { ar: 'كوفي ناعم، يناسب المقاهي والعلامات اللي تبي طابع محلي.', en: 'Soft Kufi; suits cafés and brands wanting a local feel.' } },
  { family: 'El Messiri', role: 'display', weights: [400, 500, 600, 700], latin: true, mood: ['friendly', 'cafe', 'luxury'],
    note: { ar: 'عناوين بشخصية، دافي ومرح.', en: 'Characterful, warm headline face.' } },
  { family: 'Changa', role: 'display', weights: [400, 500, 600, 700, 800], latin: true, mood: ['tech', 'bold', 'gaming'],
    note: { ar: 'مربّع وتقني، للألعاب والتقنية.', en: 'Squarish and techy; gaming and tech.' } },
  { family: 'Lalezar', role: 'display', weights: [400], latin: true, mood: ['bold', 'retail', 'playful'],
    note: { ar: 'عريض جداً ومرح، للعروض والإعلانات فقط.', en: 'Very heavy and playful; promos and ads only.' } },
];

export const pairings = [
  { id: 'lines', display: 'Alexandria', body: 'Rubik', for: ['startup', 'store', 'bold', 'tech'], ar: 'هوية خطوط: عريضة وحديثة', en: 'The Lines Studio pair: bold and modern' },
  { id: 'clinic', display: 'Readex Pro', body: 'Almarai', for: ['clinic', 'health', 'clean'], ar: 'هادي وموثوق', en: 'Calm and trustworthy' },
  { id: 'heritage', display: 'Reem Kufi', body: 'Tajawal', for: ['food', 'cafe', 'heritage'], ar: 'طابع محلي دافي', en: 'Warm local character' },
  { id: 'luxury', display: 'Amiri', body: 'IBM Plex Sans Arabic', for: ['realestate', 'luxury', 'editorial'], ar: 'فخامة كلاسيكية', en: 'Classic luxury' },
  { id: 'corporate', display: 'IBM Plex Sans Arabic', body: 'IBM Plex Sans Arabic', for: ['corporate', 'serious', 'government'], ar: 'رسمي ومتزن', en: 'Formal and balanced' },
  { id: 'kufi', display: 'Noto Kufi Arabic', body: 'Noto Naskh Arabic', for: ['islamic', 'editorial', 'heritage'], ar: 'محتوى ديني وتحريري', en: 'Islamic and editorial content' },
];

// Which pairing each gallery category uses by default.
export const categoryPairing = {
  clinic: 'clinic',
  food: 'heritage',
  realestate: 'luxury',
  startup: 'lines',
  store: 'lines',
};

export function fontLink(families) {
  const uniq = [...new Set(families)];
  const q = uniq
    .map((f) => {
      const font = fonts.find((x) => x.family === f);
      const w = font ? font.weights.join(';') : '400;700';
      return `family=${f.replace(/ /g, '+')}:wght@${w}`;
    })
    .join('&');
  return `https://fonts.googleapis.com/css2?${q}&display=swap`;
}

export function pairingById(id) {
  return pairings.find((p) => p.id === id) || pairings[0];
}
