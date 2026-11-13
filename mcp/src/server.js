// Lines Studio MCP server — Arabic/RTL designs for AI agents.
// Streamable HTTP, stateless: POST /mcp. Health check: GET /health.
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { designs, categories, sizes, findDesign, summary, kit, generatePage } from './kit.js';
import { fonts, pairings, fontLink } from './fonts.js';
import { audit } from './audit.js';
import { site } from '../../lib/site.js';
import { t } from '../../lib/dict.js';
import { launchOffer, launchPrice, offerActive } from '../../lib/promo.js';
import { isSaudiMobile } from '../../lib/phone.js';
import { adDialects, adPresets, adRequestMessage, adsCopy, adSwapKinds, needsLikenessConsent } from '../../lib/ads.js';

const VERSION = '0.1.0';
const Lang = z.enum(['ar', 'en']).default('ar').describe('Response language: ar (default) or en');
const designIds = designs.map((d) => d.id);
const DesignId = z.enum(designIds).describe(`Gallery design id: ${designIds.join(', ')}`);

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });
const fmt = (n) => n.toLocaleString('en-US');

export function buildServer() {
  const server = new McpServer(
    { name: 'lines-studio', title: 'Lines Studio · خطوط ستوديو', version: VERSION, websiteUrl: `https://${site.domain}` },
    {
      instructions:
        'Arabic-first design tools from Lines Studio (Riyadh). Use list_designs → get_design_kit for tokens, '
        + 'generate_page for a full RTL page, arabic_fonts for font choices, rtl_audit to review any Arabic HTML/CSS, '
        + 'and get_pricing / create_order_link when the user wants the studio to build the real site. '
        + 'request_ad_localization prepares a request to make a Saudi version of an existing video ad. '
        + 'Reply to Arabic users in Arabic.',
    },
  );

  server.registerTool('list_designs', {
    title: 'List gallery designs',
    description: 'List the Lines Studio gallery designs (Arabic/English website designs), optionally filtered by business category.',
    inputSchema: {
      category: z.enum(categories.filter((c) => c.id !== 'all').map((c) => c.id)).optional().describe('clinic, food, realestate, startup or store'),
      lang: Lang,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ category, lang }) => {
    const list = designs.filter((d) => !category || d.cat === category).map((d) => summary(d, lang));
    return json({
      categories: categories.filter((c) => c.id !== 'all').map((c) => ({ id: c.id, name: c[lang] })),
      designs: list,
    });
  });

  server.registerTool('get_design_kit', {
    title: 'Get a design kit',
    description: 'Design tokens for one gallery design: colors, Arabic font pairing with Google Fonts URL, spacing, type scale, CSS variables, section list, RTL rules and sample Arabic/English copy. Use it to build on-brand Arabic UI.',
    inputSchema: { design_id: DesignId, lang: Lang },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ design_id, lang }) => {
    const d = findDesign(design_id);
    if (!d) return fail(`Unknown design "${design_id}". Call list_designs.`);
    return json(kit(d, lang));
  });

  server.registerTool('generate_page', {
    title: 'Generate an Arabic page',
    description: 'Generate a complete, self-contained, responsive landing page (HTML + CSS, no JS) from a gallery design. Arabic pages are RTL with logical CSS properties, Arabic fonts and correct bidi handling. Fill in the business details to replace the sample copy.',
    inputSchema: {
      design_id: DesignId,
      lang: Lang,
      business_name: z.string().max(80).optional().describe('Business name shown in the header and title'),
      headline: z.string().max(120).optional().describe('Hero headline'),
      tagline: z.string().max(240).optional().describe('One sentence under the headline'),
      services: z.array(z.string().max(60)).max(8).optional().describe('Up to 8 services or products'),
      city: z.string().max(40).optional(),
      whatsapp: z.string().max(20).optional().describe('WhatsApp number in international format, e.g. 9665XXXXXXXX'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (input) => {
    const d = findDesign(input.design_id);
    if (!d) return fail(`Unknown design "${input.design_id}". Call list_designs.`);
    const html = generatePage(d, input);
    const note = input.lang === 'en'
      ? 'Starter page from Lines Studio. For a finished multi-page bilingual site reviewed by a designer, see get_pricing.'
      : 'صفحة مبدئية من خطوط ستوديو. للموقع الكامل بالعربي والإنجليزي ومراجعة مصمم، شوف get_pricing.';
    return {
      content: [
        { type: 'text', text: note },
        { type: 'resource', resource: { uri: `lines://pages/${d.id}-${input.lang || 'ar'}.html`, mimeType: 'text/html', text: html } },
      ],
    };
  });

  server.registerTool('arabic_fonts', {
    title: 'Arabic fonts',
    description: 'Curated Arabic-capable Google Fonts and tested display/body pairings, with ready <link> URLs. Filter by mood (bold, clean, corporate, heritage, luxury, tech, friendly, cafe, islamic, editorial, retail, health, playful, gaming) or use (e.g. clinic, food, startup).',
    inputSchema: {
      mood: z.string().max(30).optional().describe('Mood or use, e.g. luxury, clinic, tech'),
      role: z.enum(['display', 'body', 'both']).optional(),
      lang: Lang,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ mood, role, lang }) => {
    const m = mood?.toLowerCase().trim();
    const list = fonts
      .filter((f) => !role || f.role === role || f.role === 'both')
      .filter((f) => !m || f.mood.includes(m))
      .map((f) => ({ family: f.family, role: f.role, weights: f.weights, hasLatin: f.latin, mood: f.mood, note: f.note[lang], googleFontsUrl: fontLink([f.family]) }));
    const pairs = pairings
      .filter((p) => !m || p.for.includes(m))
      .map((p) => ({ id: p.id, display: p.display, body: p.body, why: p[lang], for: p.for, googleFontsUrl: fontLink([p.display, p.body]), css: `--display: '${p.display}', system-ui, sans-serif;\n--body: '${p.body}', system-ui, sans-serif;` }));
    return json({ fonts: list.length ? list : fonts.map((f) => ({ family: f.family, role: f.role, mood: f.mood })), pairings: pairs.length ? pairs : pairings.map((p) => ({ id: p.id, display: p.display, body: p.body, for: p.for })), matched: list.length > 0 || pairs.length > 0 });
  });

  server.registerTool('rtl_audit', {
    title: 'RTL audit',
    description: 'Review HTML or CSS for Arabic/RTL mistakes: missing dir/lang, physical left/right properties, letter-spacing on Arabic, tight line-height, Latin-only fonts, unmirrored arrows, unisolated numbers/emails. Returns a score and line-by-line fixes (messages in Arabic).',
    inputSchema: {
      source: z.string().min(1).max(400000).describe('HTML or CSS source'),
      lang: z.enum(['ar', 'en']).optional().describe('Page language if known'),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ source, lang }) => json(audit(source, { lang })));

  server.registerTool('get_pricing', {
    title: 'Studio pricing',
    description: 'Lines Studio packages and prices in SAR: sites from the gallery by size, custom projects and the monthly design subscription. Use when the user wants the studio to build or design something for real.',
    inputSchema: { lang: Lang },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async ({ lang }) => {
    const d = t(lang);
    return json({
      currency: 'SAR',
      vat: lang === 'ar' ? 'الأسعار نهائية، المنشأة غير مسجلة في ضريبة القيمة المضافة' : 'Final prices; the business is not VAT-registered',
      launchOffer: offerActive()
        ? { percentOff: launchOffer.pct, ends: launchOffer.ends, subscriptionMonths: launchOffer.subscriptionMonths, label: launchOffer.label[lang] }
        : null,
      promoCodes: lang === 'ar' ? 'أكواد الخصم تُدخل في صفحة الطلب على الموقع، وتنطبق فوق خصم الإطلاق.' : 'Promo codes are entered on the order page of the site and apply on top of the launch offer.',
      galleryBySize: sizes.map((s) => ({ id: s.id, label: s.label[lang], hint: s.hint[lang], listPrice: s.price, price: launchPrice(s.price), deliveryDays: s.days })),
      packages: d.packages.items.map((p) => ({ name: p.name, description: p.desc, listPrice: p.amount, price: launchPrice(p.amount), from: Boolean(p.plus), unit: p.unit, note: p.note((n) => fmt(launchPrice(n))) })),
      trialWeek: { title: d.trial.title, description: d.trial.sub((n) => fmt(launchPrice(n))) },
      contact: { whatsapp: `https://wa.me/${site.whatsapp}`, email: site.email, website: `https://${site.domain}/${lang}/` },
    });
  });

  server.registerTool('create_order_link', {
    title: 'Create order link',
    description: 'Build a pre-filled WhatsApp link that sends a gallery-site order to Lines Studio. Nothing is sent automatically: give the link to the user to open and confirm. Ask the user for their business name and Saudi mobile first.',
    inputSchema: {
      design_id: DesignId,
      size: z.enum(sizes.map((s) => s.id)).describe('one (1 page), five (up to 5 pages) or ten (10+ pages)'),
      business_name: z.string().min(1).max(80),
      phone: z.string().max(20).describe('Customer Saudi mobile, e.g. 05XXXXXXXX'),
      city: z.string().max(40).optional(),
      details: z.string().max(600).optional().describe('Services and anything they want on the site'),
      site_languages: z.array(z.enum(['ar', 'en'])).min(1).default(['ar', 'en']),
      lang: Lang,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ design_id, size, business_name, phone, city, details, site_languages, lang }) => {
    const d = t(lang).order;
    const design = findDesign(design_id);
    const s = sizes.find((x) => x.id === size);
    if (!isSaudiMobile(phone)) return fail(d.errPhoneFormat);
    const langs = site_languages.map((l) => (l === 'ar' ? d.langAr : d.langEn)).join(' + ');
    const msg = [
      d.waIntro,
      `• ${d.design}: ${design.name[lang]} (${design.id})`,
      `• ${d.size}: ${s.label[lang]} — ${fmt(s.price)} SAR`,
      offerActive() && `• ${launchOffer.label[lang]} ${launchOffer.pct}%: ${fmt(launchPrice(s.price))} SAR`,
      `• ${d.name}: ${business_name}`,
      city && `• ${d.city}: ${city}`,
      `• ${d.phone}: ${phone}`,
      `• ${d.langs}: ${langs}`,
      details && `• ${d.details}: ${details}`,
      lang === 'ar' ? '(الطلب من وكيل ذكاء اصطناعي عبر MCP)' : '(Sent from an AI agent via MCP)',
    ].filter(Boolean).join('\n');
    return json({
      link: `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`,
      orderPage: `https://${site.domain}/${lang}/order/?design=${design.id}`,
      total: launchPrice(s.price),
      listPrice: s.price,
      currency: 'SAR',
      deliveryDays: s.days,
      message: msg,
      note: lang === 'ar' ? 'افتح الرابط وأرسل الرسالة، والفريق يرد خلال ساعات العمل برابط الدفع.' : 'Open the link and send the message; the team replies in business hours with a payment link.',
    });
  });

  const presetIds = [...new Set(Object.values(adPresets).flat().map((p) => p.id))];
  server.registerTool('request_ad_localization', {
    title: 'Request ad localization',
    description: 'Build a pre-filled WhatsApp link asking Lines Studio for a Saudi version of an existing video ad '
      + '(swap characters, outfits, products, backgrounds; Saudi-dialect captions or voice-over). Nothing is sent automatically: '
      + 'give the link to the user to open and send. The studio replies with a quote; price is per request. '
      + 'Ask for business name and Saudi mobile first. Swapping characters or a voice-over needs the user to confirm they hold the rights '
      + '(likeness_consent: true); never set it on their behalf.',
    inputSchema: {
      business_name: z.string().min(1).max(80),
      phone: z.string().max(20).describe('Customer Saudi mobile, e.g. 05XXXXXXXX'),
      city: z.string().max(40).optional(),
      ad_url: z.string().url().max(500).optional().describe('https link to the source ad, if the user has one'),
      swaps: z.array(z.object({
        kind: z.enum(adSwapKinds.map((k) => k.id)),
        preset: z.enum(presetIds).optional().describe(Object.entries(adPresets).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.map((p) => p.id).join(', ')}`).join(' | ')),
      })).max(4).default([]),
      captions: z.boolean().default(true).describe('Arabic captions on the video'),
      dub: z.boolean().default(false).describe('Saudi-dialect voice-over'),
      dialect: z.enum(adDialects.map((d) => d.id)).default('najdi'),
      details: z.string().max(600).optional(),
      likeness_consent: z.boolean().default(false).describe('Only true if the user said they hold the rights to change the people and voices in the ad'),
      lang: Lang,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ business_name, phone, city, ad_url, swaps, captions, dub, dialect, details, likeness_consent, lang }) => {
    const c = adsCopy[lang] || adsCopy.ar;
    if (!isSaudiMobile(phone)) return fail(c.errPhoneFormat);
    if (ad_url && !/^https:\/\//i.test(ad_url)) return fail(c.errUrl);
    const kinds = [...new Set(swaps.map((s) => s.kind))];
    const presets = {};
    for (const s of swaps) {
      if (!s.preset) continue;
      if (!(adPresets[s.kind] || []).some((p) => p.id === s.preset)) return fail(`preset ${s.preset} does not fit ${s.kind}`);
      presets[s.kind] = s.preset;
    }
    if (kinds.length === 0 && !captions && !dub) return fail(c.errKinds);
    const consentNeeded = needsLikenessConsent({ kinds, dub });
    if (consentNeeded && !likeness_consent) return fail(c.errConsent);
    const msg = adRequestMessage({
      lang, name: business_name, phone, city, adUrl: ad_url, kinds, presets,
      dialect: captions || dub ? dialect : null, captions, dub, details,
      consent: consentNeeded && likeness_consent, viaAgent: true,
    });
    return json({
      link: `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`,
      page: `https://${site.domain}/${lang}/ads/`,
      price: lang === 'ar' ? 'حسب الطلب' : 'Per request',
      message: msg,
      note: lang === 'ar'
        ? 'افتح الرابط وأرسل الرسالة. الفريق يراجع الإعلان والحقوق ويرد بعرض سعر قبل أي دفع.'
        : 'Open the link and send the message. The team checks the ad and rights and replies with a quote before any payment.',
    });
  });

  server.registerPrompt('arabic_landing_page', {
    title: 'Arabic landing page',
    description: 'Build an Arabic RTL landing page for a business using a Lines Studio design.',
    argsSchema: { business: z.string().describe('What the business is, e.g. "dental clinic in Jeddah"') },
  }, ({ business }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `أبي صفحة هبوط عربية لـ: ${business}.\n1. استخدم list_designs واختر أنسب تصميم.\n2. خذ get_design_kit عشان الألوان والخطوط.\n3. ولّد الصفحة بـ generate_page بمحتوى مناسب للنشاط.\n4. راجعها بـ rtl_audit وصلّح أي ملاحظة.\n5. في الأخير اعرض عليّ get_pricing لو أبي الموقع الكامل.`,
      },
    }],
  }));

  return server;
}

// ---- HTTP ----
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 1_000_000;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id',
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined); }
      catch { reject(Object.assign(new Error('invalid json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

const rpcError = (res, status, code, message) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...cors });
  res.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }));
};

export function createHttpServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

    if (url.pathname === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json', ...cors });
      res.end(JSON.stringify({ ok: true, name: 'lines-studio-mcp', version: VERSION }));
      return;
    }

    if (url.pathname === '/' && req.method === 'GET') {
      res.writeHead(302, { Location: `https://${site.domain}/ar/mcp/`, ...cors });
      res.end();
      return;
    }

    if (url.pathname !== '/mcp') { rpcError(res, 404, -32601, 'Not found. MCP endpoint is /mcp'); return; }
    if (req.method !== 'POST') { rpcError(res, 405, -32000, 'Method not allowed. This server is stateless: use POST /mcp.'); return; }

    let body;
    try { body = await readBody(req); } catch (e) { rpcError(res, e.status || 400, -32700, e.message); return; }

    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); server.close(); });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) rpcError(res, 500, -32603, 'Internal error');
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  createHttpServer().listen(PORT, () => console.log(`Lines Studio MCP on :${PORT}/mcp`));
}
