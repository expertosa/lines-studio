/** Files the team works from: a review sheet (Markdown), a scheduler import (CSV) and UGC video jobs for the reels. */

const KIND_AR = { post: 'منشور', reel: 'ريلز', story: 'ستوري' };

export function toMarkdown(brief, items) {
  const out = [`# تقويم محتوى ${brief.business} — ${brief.month}`, '', `الباقة: ${brief.package} · المنصات: ${brief.platforms.join('، ')} · عدد القطع: ${items.length}`, ''];
  const flagged = items.filter((i) => i.issues.length);
  if (flagged.length) out.push(`> تحتاج مراجعة: ${flagged.map((i) => i.id).join('، ')}`, '');
  for (const item of items) {
    out.push(`## ${item.id} · ${item.date} · ${item.platform} · ${KIND_AR[item.kind] || item.kind}${item.occasion ? ` · ${item.occasion}` : ''}`);
    if (item.missing) {
      out.push('', '_لم يُكتب._', '');
      continue;
    }
    out.push('', `**${item.hook}**`, '', item.caption);
    if (item.slides?.length) out.push('', 'الشرائح:', ...item.slides.map((s, i) => `${i + 1}. ${s}`));
    if (item.script) out.push('', 'نص الريلز:', '', `> ${item.script}`);
    if (item.hashtags?.length) out.push('', item.hashtags.join(' '));
    out.push('', `- الدعوة: ${item.cta}`, `- للمصمم: ${item.visual}`);
    if (item.issues.length) out.push(`- ⚠️ ${item.issues.join('؛ ')}`);
    out.push('');
  }
  return out.join('\n');
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(items) {
  const header = ['id', 'date', 'platform', 'kind', 'format', 'pillar', 'occasion', 'caption', 'hashtags', 'cta', 'visual', 'slides', 'script', 'issues'];
  const rows = items.map((i) => [
    i.id, i.date, i.platform, i.kind, i.format, i.pillar, i.occasion || '',
    i.caption || '', (i.hashtags || []).join(' '), i.cta || '', i.visual || '', (i.slides || []).join(' | '), i.script || '', i.issues.join('; '),
  ].map(csvCell).join(','));
  return `﻿${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

/** Reel scripts as ready-to-send UGC jobs for the Lines video API (POST /v1/jobs). Nothing is sent from here. */
export function toVideoJobs(brief, items, { presenter = 'yousef' } = {}) {
  return items.filter((i) => i.kind === 'reel' && i.script && !i.issues.length).map((i) => ({
    reference: `social-${brief.month}-${i.id}`,
    title: `${brief.business} — ${i.hook}`.slice(0, 120),
    script: { text: i.script },
    style: 'ugc',
    format: '9:16',
    language: brief.language,
    seconds: i.script.split(/\s+/).length > 40 ? 30 : 15,
    metadata: { presenter, source: 'social-content', slot: i.id, date: i.date },
  }));
}
