// Starts the server and calls every tool through a real MCP client.
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createHttpServer } from '../src/server.js';

const http = createHttpServer();
await new Promise((r) => http.listen(0, r));
const base = `http://127.0.0.1:${http.address().port}`;
const client = new Client({ name: 'smoke', version: '1' });
await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return r;
};

const { tools } = await client.listTools();
assert.deepEqual(tools.map((t) => t.name).sort(), ['arabic_fonts', 'create_order_link', 'generate_page', 'get_design_kit', 'get_pricing', 'list_designs', 'request_ad_localization', 'rtl_audit']);

let r = await call('list_designs', { category: 'clinic' });
assert.equal(r.structuredContent.designs.length, 2);

r = await call('get_design_kit', { design_id: 'sufra' });
assert.equal(r.structuredContent.theme, 'dark');
assert.match(r.structuredContent.css, /--accent: #E0A526/);

for (const lang of ['ar', 'en']) {
  r = await call('generate_page', { design_id: 'naqaa', lang, business_name: 'عيادة نقاء', whatsapp: '966500000000', services: ['تنظيف', 'تقويم'] });
  const html = r.content[1].resource.text;
  assert.match(html, lang === 'ar' ? /dir="rtl"/ : /dir="ltr"/);
  const a = await call('rtl_audit', { source: html, lang });
  console.log(`generated ${lang} page audit:`, a.structuredContent.score, a.structuredContent.findings.map((f) => f.rule));
  assert.equal(a.structuredContent.count, 0, JSON.stringify(a.structuredContent.findings));
  if (lang === 'ar') (await import('node:fs')).writeFileSync('/tmp/naqaa-ar.html', html);
}

r = await call('rtl_audit', { source: '<html lang="en"><body style="font-family: Inter; letter-spacing: 2px; text-align: left; margin-left: 10px">مرحبا اتصل 0550000000</body></html>' });
console.log('bad page audit:', r.structuredContent.score, r.structuredContent.findings.map((f) => f.rule));
assert.ok(r.structuredContent.findings.length >= 5);

r = await call('arabic_fonts', { mood: 'luxury' });
assert.ok(r.structuredContent.pairings.some((p) => p.id === 'luxury'));

r = await call('get_pricing', {});
assert.equal(r.structuredContent.galleryBySize[0].listPrice, 1900);
assert.equal(r.structuredContent.galleryBySize[0].price, 1330); // 30% launch offer
assert.equal(r.structuredContent.launchOffer.percentOff, 30);
assert.match(r.structuredContent.packages[0].note, /1,330/);

r = await call('create_order_link', { design_id: 'muftah', size: 'five', business_name: 'مكتب مفتاح', phone: '0551234567' });
assert.match(r.structuredContent.link, /^https:\/\/wa\.me\/966541555511\?text=/);
assert.equal(r.structuredContent.total, 3430);
r = await call('create_order_link', { design_id: 'muftah', size: 'five', business_name: 'x', phone: '123' });
assert.equal(r.isError, true);

r = await call('request_ad_localization', {
  business_name: 'محمصة الديرة', phone: '0551234567', ad_url: 'https://example.com/ad.mp4',
  swaps: [{ kind: 'outfit', preset: 'thobe-shemagh' }, { kind: 'background', preset: 'riyadh-boulevard' }, { kind: 'product' }],
});
assert.equal(r.isError, undefined, JSON.stringify(r.content));
assert.match(r.structuredContent.link, /^https:\/\/wa\.me\/966541555511\?text=/);
assert.match(r.structuredContent.message, /ثوب وشماغ/);
assert.match(r.structuredContent.message, /بوليفارد الرياض/);
assert.match(r.structuredContent.message, /نجدي/);
assert.match(r.structuredContent.page, /\/ar\/ads\/$/);
r = await call('request_ad_localization', { business_name: 'x', phone: '0551234567', swaps: [{ kind: 'character', preset: 'saudi-man' }] });
assert.equal(r.isError, true, 'character swap needs consent');
r = await call('request_ad_localization', { business_name: 'x', phone: '0551234567', swaps: [{ kind: 'character' }], likeness_consent: true });
assert.match(r.structuredContent.message, /أؤكد إن عندي حق/);
r = await call('request_ad_localization', { business_name: 'x', phone: '0551234567', swaps: [{ kind: 'outfit', preset: 'alula' }] });
assert.equal(r.isError, true, 'background preset on an outfit');
r = await call('request_ad_localization', { business_name: 'x', phone: '123', captions: true });
assert.equal(r.isError, true, 'bad phone');
r = await call('request_ad_localization', { business_name: 'x', phone: '0551234567', captions: false, dub: false });
assert.equal(r.isError, true, 'nothing requested');

const { prompts } = await client.listPrompts();
assert.equal(prompts[0].name, 'arabic_landing_page');

const h = await fetch(`${base}/health`).then((x) => x.json());
assert.equal(h.ok, true);

await client.close();
http.close();
console.log('ALL OK');
