// Static RTL/Arabic review of HTML or CSS. Heuristic: finds the common mistakes
// we fix on client sites, with the line number and the fix.
import { fonts } from './fonts.js';

const arabicFamilies = new Set(fonts.map((f) => f.family.toLowerCase()));
const knownArabic = [
  ...arabicFamilies,
  'noto sans arabic', 'markazi text', 'lateef', 'scheherazade new', 'harmattan', 'mada', 'baloo bhaijaan 2',
  'vazirmatn', 'kufam', 'aref ruqaa', 'mirza', 'rakkas', 'katibeh', 'jomhuria', 'lemonada', 'blaka', 'qahiri',
  'gulzar', 'zain', 'handjet', 'marhey', 'beiruti', 'thmanyah', 'sst arabic', 'dubai', 'frutiger arabic',
  'geeza pro', 'sf arabic', 'segoe ui', 'tahoma', 'arial', 'system-ui', '-apple-system',
];
const latinOnly = ['inter', 'roboto', 'poppins', 'montserrat', 'open sans', 'lato', 'helvetica', 'helvetica neue', 'playfair display', 'raleway', 'nunito', 'dm sans', 'manrope', 'space grotesk', 'outfit', 'plus jakarta sans'];

const physical = [
  { re: /\b(margin|padding)-(left|right)\s*:/i, fix: (m) => `${m[1]}-inline-${m[2].toLowerCase() === 'left' ? 'start' : 'end'} (في RTL: left=end و right=start، راجع الاتجاه)` },
  { re: /(?<![-\w])(left|right)\s*:\s*[^;}"]+/i, fix: (m) => `inset-inline-${m[1].toLowerCase() === 'left' ? 'start' : 'end'}` },
  { re: /text-align\s*:\s*(left|right)/i, fix: (m) => `text-align: ${m[1].toLowerCase() === 'left' ? 'start' : 'end'}` },
  { re: /border-(left|right)(-\w+)?\s*:/i, fix: (m) => `border-inline-${m[1].toLowerCase() === 'left' ? 'start' : 'end'}${m[2] || ''}` },
  { re: /float\s*:\s*(left|right)/i, fix: (m) => `float: inline-${m[1].toLowerCase() === 'left' ? 'start' : 'end'}` },
  { re: /border-(top|bottom)-(left|right)-radius\s*:/i, fix: (m) => `border-${m[1] === 'top' ? 'start' : 'end'}-${m[2] === 'left' ? 'start' : 'end'}-radius` },
];

const arabicRe = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

export function audit(source, opts = {}) {
  const findings = [];
  const add = (severity, rule, line, message, fix) => findings.push({ severity, rule, line, message, fix });
  const lines = source.split('\n');
  const hasArabic = arabicRe.test(source);
  const isHtml = /<html|<body|<div|<p[\s>]|<!doctype/i.test(source);

  if (isHtml) {
    const htmlTag = source.match(/<html[^>]*>/i);
    if (!htmlTag) {
      add('high', 'html-dir', 1, 'ما فيه عنصر <html>، فما نقدر نتأكد من dir و lang.', '<html lang="ar" dir="rtl">');
    } else {
      const tag = htmlTag[0];
      const ln = lineOf(source, htmlTag.index);
      if (!/dir\s*=\s*["']?rtl/i.test(tag) && (opts.lang !== 'en') && hasArabic) add('high', 'html-dir', ln, 'المحتوى عربي بس الصفحة ما عليها dir="rtl".', 'أضف dir="rtl" على <html>');
      if (!/lang\s*=/i.test(tag)) add('medium', 'html-lang', ln, 'ما فيه lang على <html>. يأثر على قارئ الشاشة والبحث والخط.', 'lang="ar"');
      else if (hasArabic && /lang\s*=\s*["']?en/i.test(tag) && opts.lang !== 'en') add('medium', 'html-lang', ln, 'الصفحة عربية بس lang="en".', 'lang="ar"');
    }
    if (!/<meta[^>]+viewport/i.test(source) && /<head/i.test(source)) add('medium', 'viewport', 1, 'ما فيه meta viewport، الصفحة بتطلع صغيرة على الجوال.', '<meta name="viewport" content="width=device-width, initial-scale=1">');
  }

  lines.forEach((text, i) => {
    const ln = i + 1;
    for (const p of physical) {
      const m = text.match(p.re);
      if (m && !/inline|inset-inline/.test(m[0])) {
        add('medium', 'logical-properties', ln, `خاصية فيزيائية "${m[0].trim().slice(0, 40)}" ما تنعكس مع RTL.`, p.fix(m));
        break;
      }
    }
    const ls = text.match(/letter-spacing\s*:\s*([^;}"]+)/i);
    if (ls && !/^\s*(0|normal|0px|0em)\s*$/i.test(ls[1]) && hasArabic) {
      add('high', 'letter-spacing', ln, `letter-spacing: ${ls[1].trim()} يقطّع الحروف العربية المتصلة.`, 'احذفه للعربي، أو قيّده بـ :lang(en)');
    }
    const lh = text.match(/line-height\s*:\s*([\d.]+)\s*(;|}|"|$)/i);
    if (lh && hasArabic && parseFloat(lh[1]) < 1.25) {
      add('medium', 'line-height', ln, `line-height: ${lh[1]} ضيق على العربي، الحركات والنقاط تتلاصق.`, 'نص 1.7–1.9، عناوين 1.25 أو أكثر');
    }
    const ff = text.match(/font-family\s*:\s*([^;}"]+)/i) || text.match(/fonts\.googleapis\.com\/css2?\?([^"']+)/i);
    if (ff && hasArabic) {
      const raw = ff[1].toLowerCase().replace(/family=/g, '').replace(/\+/g, ' ');
      const list = raw.split(/[,&|]/).map((s) => s.split(':')[0].replace(/['"]/g, '').trim()).filter(Boolean);
      const first = list[0];
      if (first && latinOnly.includes(first) && !list.some((f) => knownArabic.includes(f))) {
        add('high', 'arabic-font', ln, `الخط "${first}" ما فيه حروف عربية، والمتصفح بيستخدم خط النظام.`, 'استخدم خط عربي مثل Readex Pro أو IBM Plex Sans Arabic أو Alexandria (شغّل arabic_fonts)');
      }
    }
    if (/(→|←|›|‹|chevron-(left|right)|arrow-(left|right))/i.test(text) && !/scaleX\(-1\)|rtl:|\[dir/.test(source)) {
      add('low', 'mirror-icons', ln, 'أيقونة اتجاه. تأكد إنها تنعكس حسب اتجاه الصفحة.', '[dir="rtl"] .icon-arrow { transform: scaleX(-1); }');
    }
    // Visible text only: URLs inside href/src attributes are fine.
    const visible = text.replace(/<bdi[\s\S]*?<\/bdi>/gi, '').replace(/<[^>]*>/g, ' ');
    if (arabicRe.test(visible) && /(\+?\d[\d\s-]{8,}\d|[\w.+-]+@[\w-]+\.[\w.]+|https?:\/\/\S+)/.test(visible) && !/dir=["']ltr|⁦|⁨/.test(text)) {
      add('low', 'bidi-isolate', ln, 'رقم أو إيميل أو رابط داخل جملة عربية، ممكن يتلخبط ترتيبه.', 'لفّه بـ <bdi dir="ltr">…</bdi>');
    }
    if (/text-transform\s*:\s*uppercase/i.test(text) && hasArabic) {
      add('low', 'uppercase', ln, 'text-transform: uppercase ما له معنى في العربي، ويخرب لو انطبق على كلمات إنجليزية داخل النص.', 'قيّده بـ :lang(en)');
    }
    if (/font-style\s*:\s*italic/i.test(text) && hasArabic) {
      add('low', 'italic', ln, 'المائل ما يناسب العربي، المتصفح يميّل الحروف صناعياً.', 'استخدم وزن أعرض أو لون للتمييز');
    }
  });

  const order = { high: 0, medium: 1, low: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);
  const score = Math.max(0, 100 - findings.reduce((s, f) => s + (f.severity === 'high' ? 15 : f.severity === 'medium' ? 6 : 2), 0));
  return { score, count: findings.length, findings: findings.slice(0, 60), truncated: findings.length > 60 };
}

function lineOf(src, idx) {
  return src.slice(0, idx).split('\n').length;
}
