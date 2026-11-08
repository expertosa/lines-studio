// Design kits and page generation for the gallery designs.
import { designs, categories, sizes } from '../../lib/designs.js';
import { categoryPairing, pairingById, fontLink } from './fonts.js';

// Default sections and copy per business type. Agents replace these with real content.
const blueprints = {
  clinic: {
    sections: ['hero', 'services', 'why', 'hours', 'faq', 'contact'],
    ar: {
      hero: 'ابتسامتك بأيدٍ أمينة', sub: 'احجز موعدك بخطوة وحدة، وفريقنا يتواصل معك خلال ساعات.', cta: 'احجز موعدك',
      services: ['الكشف والاستشارة', 'التنظيف والتبييض', 'التقويم', 'زراعة الأسنان'],
      why: [['مواعيد دقيقة', 'نحترم وقتك، وانتظارك أقل من ١٠ دقائق.'], ['أسعار واضحة', 'تعرف التكلفة قبل ما تبدأ.'], ['تعقيم كامل', 'معايير مكافحة العدوى في كل زيارة.']],
      faq: [['هل تقبلون التأمين؟', 'اكتب لنا اسم شركة التأمين ونأكد لك.'], ['كيف ألغي موعدي؟', 'رد على رسالة التأكيد في واتساب.']],
    },
    en: {
      hero: 'Your smile, in safe hands', sub: 'Book in one step and our team gets back to you within hours.', cta: 'Book a visit',
      services: ['Check-up & consultation', 'Cleaning & whitening', 'Orthodontics', 'Implants'],
      why: [['On time', 'We respect your time; waits under 10 minutes.'], ['Clear prices', 'Know the cost before you start.'], ['Fully sterile', 'Infection-control standards every visit.']],
      faq: [['Do you accept insurance?', 'Send us your insurer and we will confirm.'], ['How do I cancel?', 'Reply to the confirmation message on WhatsApp.']],
    },
  },
  food: {
    sections: ['hero', 'services', 'why', 'hours', 'contact'],
    ar: {
      hero: 'طعم تتذكره', sub: 'اطلب أونلاين أو زورنا في أقرب فرع.', cta: 'اطلب الحين',
      services: ['الأطباق الرئيسية', 'المقبلات', 'الحلى', 'المشروبات'],
      why: [['مكونات طازجة', 'نحضّر يومياً، بدون مجمّد.'], ['توصيل سريع', 'متوفرين على تطبيقات التوصيل.'], ['جلسات عائلية', 'مكان مريح لك ولأهلك.']],
      faq: [],
    },
    en: {
      hero: 'A taste you remember', sub: 'Order online or visit your nearest branch.', cta: 'Order now',
      services: ['Mains', 'Starters', 'Desserts', 'Drinks'],
      why: [['Fresh daily', 'Prepared every day, never frozen.'], ['Fast delivery', 'Available on delivery apps.'], ['Family seating', 'Comfortable space for everyone.']],
      faq: [],
    },
  },
  realestate: {
    sections: ['hero', 'services', 'why', 'faq', 'contact'],
    ar: {
      hero: 'بيتك الجاي يبدأ من هنا', sub: 'عروض مختارة بعناية، وزيارة ميدانية بموعد يناسبك.', cta: 'شوف العروض',
      services: ['فلل للبيع', 'شقق للإيجار', 'أراضي', 'إدارة أملاك'],
      why: [['موثّقين', 'وسيط مرخّص من الهيئة العامة للعقار.'], ['عروض حقيقية', 'كل عقار نزوره ونصوّره بنفسنا.'], ['متابعة لين الإفراغ', 'نرتب لك كل الأوراق.']],
      faq: [['كم العمولة؟', 'حسب نوع العقار، ونوضحها قبل أي زيارة.'], ['تقدرون تسوقون عقاري؟', 'إي، تواصل معنا ونزورك.']],
    },
    en: {
      hero: 'Your next home starts here', sub: 'Hand-picked listings and site visits on your schedule.', cta: 'See listings',
      services: ['Villas for sale', 'Apartments for rent', 'Land', 'Property management'],
      why: [['Licensed', 'A broker licensed by the Real Estate General Authority.'], ['Real listings', 'We visit and photograph every property.'], ['End to end', 'We handle the paperwork through transfer.']],
      faq: [['What is your commission?', 'It depends on the property; we confirm it before any visit.'], ['Can you market my property?', 'Yes, contact us and we will visit.']],
    },
  },
  startup: {
    sections: ['hero', 'services', 'why', 'faq', 'contact'],
    ar: {
      hero: 'شغلك أسرع بثلاث مرات', sub: 'منصة وحدة تجمع فريقك وبياناتك وتقاريرك.', cta: 'انضم لقائمة الانتظار',
      services: ['لوحة تحكم لحظية', 'تقارير تلقائية', 'تكامل مع أدواتك', 'صلاحيات للفريق'],
      why: [['عربي من الأساس', 'الواجهة والتقارير بالعربي من اليوم الأول.'], ['بياناتك في السعودية', 'استضافة محلية.'], ['دعم سريع', 'رد خلال ساعة في أوقات العمل.']],
      faq: [['فيه تجربة مجانية؟', 'إي، ١٤ يوم بدون بطاقة.'], ['أقدر ألغي متى ما أبي؟', 'إي، بدون أي التزام.']],
    },
    en: {
      hero: 'Work three times faster', sub: 'One platform for your team, data and reports.', cta: 'Join the waitlist',
      services: ['Live dashboard', 'Automatic reports', 'Integrations', 'Team permissions'],
      why: [['Arabic-first', 'UI and reports in Arabic from day one.'], ['Data in KSA', 'Local hosting.'], ['Fast support', 'Replies within an hour in business hours.']],
      faq: [['Is there a free trial?', 'Yes, 14 days, no card.'], ['Can I cancel anytime?', 'Yes, no commitment.']],
    },
  },
  store: {
    sections: ['hero', 'services', 'why', 'faq', 'contact'],
    ar: {
      hero: 'المجموعة الجديدة وصلت', sub: 'قطع مختارة بكميات محدودة، توصيل لكل مدن المملكة.', cta: 'تسوّق الحين',
      services: ['وصل حديثاً', 'الأكثر مبيعاً', 'العبايات', 'الإكسسوارات'],
      why: [['توصيل ٢-٤ أيام', 'لكل مدن المملكة.'], ['استرجاع سهل', 'خلال ٧ أيام من الاستلام.'], ['دفع آمن', 'مدى، أبل باي، تابي وتمارا.']],
      faq: [['كم رسوم الشحن؟', 'مجاني للطلبات فوق ٢٠٠ ريال.'], ['كيف أعرف المقاس؟', 'كل منتج له جدول مقاسات.']],
    },
    en: {
      hero: 'The new collection is here', sub: 'Limited pieces, delivered across the Kingdom.', cta: 'Shop now',
      services: ['New in', 'Best sellers', 'Abayas', 'Accessories'],
      why: [['2–4 day delivery', 'To every city in KSA.'], ['Easy returns', 'Within 7 days of delivery.'], ['Secure payment', 'mada, Apple Pay, Tabby and Tamara.']],
      faq: [['How much is shipping?', 'Free over SAR 200.'], ['How do I find my size?', 'Every product has a size chart.']],
    },
  },
};

const labels = {
  ar: { services: 'خدماتنا', why: 'ليش نحن', hours: 'أوقات العمل والموقع', faq: 'أسئلة شائعة', contact: 'تواصل معنا', wa: 'راسلنا واتساب', days: 'السبت – الخميس', city: 'الرياض', rights: 'جميع الحقوق محفوظة', madeBy: 'تصميم خطوط ستوديو' },
  en: { services: 'What we offer', why: 'Why us', hours: 'Hours & location', faq: 'FAQ', contact: 'Get in touch', wa: 'Message us on WhatsApp', days: 'Sat – Thu', city: 'Riyadh', rights: 'All rights reserved', madeBy: 'Designed by Lines Studio' },
};

export function findDesign(id) {
  return designs.find((d) => d.id === id);
}

export function isDark(c) {
  const hex = c.bg.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5;
}

export function summary(d, lang = 'ar') {
  const cat = categories.find((c) => c.id === d.cat);
  return {
    id: d.id,
    name: d.name[lang],
    category: d.cat,
    categoryName: cat ? cat[lang] : d.cat,
    description: d.desc[lang],
    theme: isDark(d.c) ? 'dark' : 'light',
    palette: d.c,
    preview: `https://lines.studio/${lang}/gallery/`,
  };
}

export function tokens(d) {
  const c = d.c;
  const dark = isDark(c);
  const p = pairingById(categoryPairing[d.cat]);
  return {
    color: {
      accent: c.accent,
      accentSoft: c.tint,
      background: c.bg,
      line: c.ink,
      heading: c.head,
      text: dark ? '#C9CDD2' : '#3D424A',
      muted: dark ? '#8E949B' : '#6B7078',
      onAccent: contrastOn(c.accent),
    },
    font: { display: p.display, body: p.body, googleFontsUrl: fontLink([p.display, p.body]) },
    radius: { sm: '8px', md: '14px', lg: '24px', pill: '999px' },
    space: { xs: '8px', sm: '12px', md: '20px', lg: '32px', xl: '56px', section: 'clamp(56px, 8vw, 104px)' },
    type: {
      h1: 'clamp(34px, 6vw, 64px) / 1.25',
      h2: 'clamp(26px, 3.6vw, 40px) / 1.3',
      body: '17px / 1.8',
      note: 'Arabic needs taller line-height than Latin (1.7–1.9 for body). Never use letter-spacing on Arabic.',
    },
  };
}

function contrastOn(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return L > 0.4 ? '#111111' : '#FFFFFF';
}

export function cssVariables(d) {
  const t = tokens(d);
  return `:root {
  --accent: ${t.color.accent};
  --accent-soft: ${t.color.accentSoft};
  --on-accent: ${t.color.onAccent};
  --bg: ${t.color.background};
  --line: ${t.color.line};
  --head: ${t.color.heading};
  --text: ${t.color.text};
  --muted: ${t.color.muted};
  --display: '${t.font.display}', system-ui, sans-serif;
  --body: '${t.font.body}', system-ui, sans-serif;
  --r-sm: 8px; --r-md: 14px; --r-lg: 24px;
  --section: clamp(56px, 8vw, 104px);
}`;
}

export function kit(d, lang = 'ar') {
  const bp = blueprints[d.cat];
  return {
    ...summary(d, lang),
    tokens: tokens(d),
    css: cssVariables(d),
    sections: bp.sections,
    rtlRules: rtlRules[lang === 'en' ? 'en' : 'ar'],
    sampleCopy: bp[lang === 'en' ? 'en' : 'ar'],
  };
}

export const rtlRules = {
  ar: [
    'حط dir="rtl" و lang="ar" على عنصر html.',
    'استخدم الخصائص المنطقية: margin-inline-start و padding-inline-end و inset-inline-start و text-align: start، بدل left و right.',
    'لا تحط letter-spacing على النص العربي، يقطّع الحروف المتصلة.',
    'line-height للنص العربي بين 1.7 و 1.9، وللعناوين 1.25 على الأقل.',
    'الأسهم وأيقونات الاتجاه تنعكس في RTL (transform: scaleX(-1))، أما الشعارات والساعة وأيقونات التشغيل فلا.',
    'أرقام الجوال والإيميلات والروابط داخل نص عربي: لفّها بـ <bdi> أو dir="ltr" عشان ما تنقلب.',
    'اختر خط فيه حروف عربية حقيقية، ولا تعتمد على الخط الاحتياطي للنظام.',
    'خط عريض وحجم أكبر شوي من الإنجليزي، العربي يطلع أصغر بصرياً في نفس الحجم.',
  ],
  en: [
    'Set dir="rtl" and lang="ar" on the html element.',
    'Use logical properties: margin-inline-start, padding-inline-end, inset-inline-start, text-align: start — never left/right.',
    'No letter-spacing on Arabic text; it breaks the joined letters.',
    'Arabic body line-height 1.7–1.9, headings at least 1.25.',
    'Mirror directional arrows in RTL (transform: scaleX(-1)); do not mirror logos, clocks or play icons.',
    'Wrap phone numbers, emails and URLs inside Arabic text in <bdi> or dir="ltr".',
    'Pick a font with real Arabic glyphs; never rely on the system fallback.',
    'Arabic looks smaller at the same size; go about 1–2px larger than Latin.',
  ],
};

const esc = (s = '') => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// A full, self-contained, responsive page. RTL for Arabic, LTR for English.
export function generatePage(d, input = {}) {
  const lang = input.lang === 'en' ? 'en' : 'ar';
  const ar = lang === 'ar';
  const L = labels[lang];
  const bp = blueprints[d.cat];
  const copy = bp[lang];
  const t = tokens(d);
  const name = input.business_name || d.name[lang];
  const hero = input.headline || copy.hero;
  const sub = input.tagline || copy.sub;
  const services = (input.services && input.services.length ? input.services : copy.services).slice(0, 8);
  const city = input.city || L.city;
  const phone = (input.whatsapp || '').replace(/[^\d]/g, '');
  const waHref = phone ? `https://wa.me/${phone}` : '#contact';
  const year = new Date().getFullYear();

  const sec = {
    hero: `
  <header class="hero">
    <div class="wrap hero-in">
      <span class="badge">${esc(city)}</span>
      <h1>${esc(hero)}</h1>
      <p class="lead">${esc(sub)}</p>
      <div class="row">
        <a class="btn" href="${esc(waHref)}">${esc(copy.cta)}</a>
        <a class="btn ghost" href="#services">${esc(L.services)} <span class="arrow" aria-hidden="true">←</span></a>
      </div>
    </div>
  </header>`,
    services: `
  <section id="services" class="wrap block">
    <h2>${esc(L.services)}</h2>
    <div class="grid">
${services.map((s, i) => `      <article class="card"><span class="num">${ar ? toArabicDigits(i + 1) : i + 1}</span><h3>${esc(s)}</h3></article>`).join('\n')}
    </div>
  </section>`,
    why: `
  <section class="soft"><div class="wrap block">
    <h2>${esc(L.why)}</h2>
    <div class="grid three">
${copy.why.map(([h, p]) => `      <div><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('\n')}
    </div>
  </div></section>`,
    hours: `
  <section class="wrap block">
    <h2>${esc(L.hours)}</h2>
    <div class="card wide"><p><strong>${esc(L.days)}</strong> · <bdi dir="ltr">9:00 – 22:00</bdi></p><p>${esc(city)}</p></div>
  </section>`,
    faq: copy.faq.length ? `
  <section class="wrap block">
    <h2>${esc(L.faq)}</h2>
${copy.faq.map(([q, a]) => `    <details class="faq"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('\n')}
  </section>` : '',
    contact: `
  <section id="contact" class="wrap block">
    <div class="cta">
      <h2>${esc(L.contact)}</h2>
      ${phone ? `<p>واتساب: <bdi dir="ltr">+${esc(phone)}</bdi></p>` : ''}
      <a class="btn inv" href="${esc(waHref)}">${esc(L.wa)}</a>
    </div>
  </section>`,
  };
  if (!ar && phone) sec.contact = sec.contact.replace('واتساب:', 'WhatsApp:');

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${ar ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<meta name="description" content="${esc(sub)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${t.font.googleFontsUrl}">
<style>
${cssVariables(d)}
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); font: 17px/1.8 var(--body); -webkit-font-smoothing: antialiased; }
h1, h2, h3 { font-family: var(--display); color: var(--head); margin: 0; line-height: 1.3; }
h1 { font-size: clamp(34px, 6vw, 64px); line-height: 1.25; font-weight: 800; }
h2 { font-size: clamp(26px, 3.6vw, 40px); font-weight: 700; margin-block-end: 24px; }
h3 { font-size: 20px; font-weight: 700; }
p { margin: 0; }
a { color: inherit; }
.wrap { max-width: 1120px; margin-inline: auto; padding-inline: 20px; }
.nav { display: flex; align-items: center; justify-content: space-between; padding-block: 18px; }
.brand { font-family: var(--display); font-weight: 800; font-size: 22px; color: var(--head); text-decoration: none; }
.hero { padding-block: clamp(48px, 9vw, 120px); }
.hero-in { display: flex; flex-direction: column; gap: 20px; align-items: flex-start; }
.hero h1 { max-width: 16ch; }
.badge { background: var(--accent-soft); color: var(--accent); padding: 4px 14px; border-radius: 999px; font-weight: 600; font-size: 14px; }
.lead { font-size: 19px; max-width: 46ch; }
.row { display: flex; gap: 12px; flex-wrap: wrap; }
.btn { display: inline-flex; align-items: center; gap: 8px; background: var(--accent); color: var(--on-accent); padding: 13px 24px; border-radius: var(--r-sm); text-decoration: none; font-weight: 600; }
.btn.ghost { background: transparent; color: var(--head); border: 1.5px solid var(--line); }
.btn.inv { background: var(--on-accent); color: var(--accent); }
[dir="ltr"] .arrow { display: inline-block; transform: scaleX(-1); }
.block { padding-block: var(--section); }
.soft { background: var(--accent-soft); }
.grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.grid.three { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 28px; }
.grid.three p { margin-block-start: 8px; }
.card { border: 1.5px solid var(--line); border-radius: var(--r-md); padding: 24px; display: flex; flex-direction: column; gap: 14px; }
.card.wide { gap: 4px; }
.num { width: 36px; height: 36px; border-radius: 999px; display: grid; place-items: center; background: var(--accent); color: var(--on-accent); font-weight: 700; }
.faq { border-block-end: 1.5px solid var(--line); padding-block: 16px; }
.faq summary { cursor: pointer; font-weight: 600; color: var(--head); }
.faq p { margin-block-start: 8px; }
.cta { background: var(--accent); color: var(--on-accent); border-radius: var(--r-lg); padding: clamp(28px, 5vw, 56px); display: flex; flex-direction: column; gap: 16px; align-items: flex-start; }
.cta h2 { color: var(--on-accent); margin: 0; }
footer { border-block-start: 1.5px solid var(--line); padding-block: 24px; font-size: 14px; color: var(--muted); }
footer .wrap { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 3px; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>
</head>
<body>
  <nav class="wrap nav" aria-label="${ar ? 'القائمة' : 'Menu'}">
    <a class="brand" href="#">${esc(name)}</a>
    <a class="btn" href="${esc(waHref)}">${esc(copy.cta)}</a>
  </nav>
${bp.sections.map((s) => sec[s]).join('\n')}
  <footer><div class="wrap"><span>© ${year} ${esc(name)} · ${esc(L.rights)}</span><a href="https://lines.studio/${lang}/">${esc(L.madeBy)}</a></div></footer>
</body>
</html>
`;
}

function toArabicDigits(n) {
  return String(n).replace(/\d/g, (x) => '٠١٢٣٤٥٦٧٨٩'[x]);
}

export { designs, categories, sizes };
