import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBrief } from '../src/brief.js';
import { buildCalendar, spread } from '../src/calendar.js';
import { generatePieces, review } from '../src/generate.js';
import { toCsv, toMarkdown, toVideoJobs } from '../src/output.js';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, userMessage } from '../src/prompt.js';

const base = {
  package: 'basic',
  month: '2026-09',
  business: 'قهوة الحي',
  sector: 'مقهى مختص',
  about: 'مقهى مختص في حي النرجس، محاصيل إثيوبية وكولومبية، يفتح من 6 الصبح.',
  platforms: ['instagram', 'x'],
  hashtags: ['#قهوة_الحي'],
};

test('brief: package limits, platforms and month are checked', () => {
  const brief = parseBrief(base);
  assert.deepEqual(brief.volume, { platforms: 2, posts: 12, reels: 2, storiesPerWeek: 3 });
  assert.equal(brief.dialect, 'saudi');
  assert.throws(() => parseBrief({ ...base, month: '2026-13' }), /YYYY-MM/);
  assert.throws(() => parseBrief({ ...base, platforms: ['instagram', 'x', 'tiktok'] }), /covers 2 platforms/);
  assert.throws(() => parseBrief({ ...base, platforms: ['myspace'] }), /unknown platform/);
  assert.throws(() => parseBrief({ ...base, package: 'gold' }), /package must be/);
  assert.throws(() => parseBrief({ ...base, about: '' }), /about is required/);
});

test('calendar: volume per package, national day placed on its date', () => {
  const slots = buildCalendar(parseBrief(base));
  const count = (kind) => slots.filter((s) => s.kind === kind).length;
  assert.equal(count('post'), 12);
  assert.equal(count('reel'), 2);
  assert.equal(count('story'), Math.round((3 * 30) / 7));
  assert.ok(slots.every((s) => s.date.startsWith('2026-09')));
  const national = slots.find((s) => s.occasion === 'اليوم الوطني');
  assert.equal(national.date, '2026-09-23');
  assert.equal(national.pillar, 'occasion');
  assert.ok(slots.filter((s) => s.kind === 'reel').every((s) => s.platform === 'instagram'));
  assert.deepEqual(new Set(slots.map((s) => s.id)).size, slots.length);
  assert.deepEqual(spread(3, 30), [6, 16, 26]);
});

test('calendar: a moving occasion from the brief replaces the nearest post', () => {
  const slots = buildCalendar(parseBrief({ ...base, month: '2027-02', occasions: [{ date: '2027-02-08', name: 'بداية رمضان' }] }));
  assert.equal(slots.find((s) => s.occasion === 'بداية رمضان').date, '2027-02-08');
  assert.equal(slots.find((s) => s.occasion === 'يوم التأسيس').date, '2027-02-22');
});

test('prompt: fixed system text, schema closed, slots listed with ids', () => {
  assert.match(SYSTEM_PROMPT, /Never invent facts/);
  assert.equal(OUTPUT_SCHEMA.properties.pieces.items.additionalProperties, false);
  const brief = parseBrief(base);
  const message = userMessage(brief, buildCalendar(brief));
  assert.match(message, /^s01 \| 2026-09-0\d \| instagram \| post\/carousel/m);
  assert.match(message, /Offers this month: none/);
});

test('review flags what a content manager would bounce', () => {
  const slot = { platform: 'x', kind: 'post', format: 'tweet' };
  const ok = { caption: 'قهوتك الصبح علينا', hashtags: ['#قهوة'], slides: [], script: '' };
  assert.deepEqual(review(slot, ok), []);
  assert.ok(review(slot, { ...ok, caption: 'ق'.repeat(290) }).includes('longer than 280 characters on X'));
  assert.ok(review(slot, { ...ok, caption: 'أفضل قهوة؟ إحنا الأفضل' }).includes('superlative claim'));
  assert.ok(review({ platform: 'instagram', kind: 'story', format: 'story' }, ok).includes('stories take no hashtags'));
  assert.ok(review({ platform: 'instagram', kind: 'reel', format: 'reel' }, ok).includes('reel without a script'));
});

function fakeClient(reply, capture = {}) {
  return {
    beta: {
      messages: {
        stream(params) {
          capture.params = params;
          return { finalMessage: async () => reply };
        },
      },
    },
  };
}

test('generate: one streamed call, structured output, fallbacks on, pieces matched to slots', async () => {
  const brief = parseBrief(base);
  const slots = buildCalendar(brief).slice(0, 2);
  const pieces = slots.map((s) => ({
    id: s.id, hook: 'صباحك أحلى', caption: 'صباحك أحلى مع قهوة الحي', hashtags: ['#قهوة_الحي'], cta: 'زورونا', visual: 'كوب على الطاولة', slides: ['١', '٢', '٣', '٤'], script: '',
  }));
  const capture = {};
  const client = fakeClient({
    stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 20 },
    content: [{ type: 'text', text: JSON.stringify({ pieces: [pieces[1]] }) }],
  }, capture);
  const result = await generatePieces(brief, slots, { client });
  assert.equal(capture.params.model, 'claude-opus-5-5');
  assert.equal(capture.params.fallbacks, 'default');
  assert.deepEqual(capture.params.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(capture.params.output_config.format.type, 'json_schema');
  assert.equal(capture.params.output_config.effort, 'medium');
  assert.equal(capture.params.system[0].cache_control.type, 'ephemeral');
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].missing, true);
  assert.equal(result.items[1].caption, 'صباحك أحلى مع قهوة الحي');
});

test('generate: refusal and truncation fail clearly, never retried', async () => {
  const brief = parseBrief(base);
  const slots = buildCalendar(brief).slice(0, 1);
  let calls = 0;
  const refusing = { beta: { messages: { stream() { calls += 1; return { finalMessage: async () => ({ stop_reason: 'refusal', stop_details: { category: 'general_harms' }, content: [] }) }; } } } };
  await assert.rejects(generatePieces(brief, slots, { client: refusing }), (e) => e.code === 'refused');
  assert.equal(calls, 1);
  const cut = fakeClient({ stop_reason: 'max_tokens', content: [] });
  await assert.rejects(generatePieces(brief, slots, { client: cut }), (e) => e.code === 'truncated');
});

test('outputs: review sheet, CSV with BOM for Excel, reels as UGC jobs', () => {
  const brief = parseBrief(base);
  const items = [
    { id: 's01', date: '2026-09-02', platform: 'instagram', kind: 'reel', format: 'reel', pillar: 'value', hook: 'وش سر الكوب؟', caption: 'وش سر الكوب؟', hashtags: ['#قهوة'], cta: 'جربها', visual: 'لقطة قريبة', slides: [], script: 'تدري وش سر الكوب الحلو؟ المحصول, والطحنة, والماء.', issues: [] },
    { id: 's02', date: '2026-09-23', platform: 'x', kind: 'post', format: 'tweet', pillar: 'occasion', occasion: 'اليوم الوطني', hook: 'دام عزك يا وطن', caption: 'دام عزك يا وطن', hashtags: ['#اليوم_الوطني'], cta: '', visual: 'علم', slides: [], script: '', issues: ['use 1 to 5 hashtags'] },
  ];
  const md = toMarkdown(brief, items);
  assert.match(md, /## s02 · 2026-09-23 · x · منشور · اليوم الوطني/);
  assert.match(md, /تحتاج مراجعة: s02/);
  const csv = toCsv(items);
  assert.ok(csv.startsWith('﻿id,date,'));
  assert.match(csv, /"تدري وش سر الكوب الحلو؟ المحصول, والطحنة, والماء."/);
  const jobs = toVideoJobs(brief, items);
  assert.equal(jobs.length, 1);
  assert.deepEqual({ style: jobs[0].style, format: jobs[0].format, seconds: jobs[0].seconds, presenter: jobs[0].metadata.presenter },
    { style: 'ugc', format: '9:16', seconds: 15, presenter: 'yousef' });
});
