import Anthropic from '@anthropic-ai/sdk';
import { OUTPUT_SCHEMA, SYSTEM_PROMPT, userMessage } from './prompt.js';

export const MODEL = 'claude-opus-5-5';

function genError(message, code) {
  return Object.assign(new Error(message), { code });
}

/** Checks a person would otherwise do by hand. Problems are reported for review, not retried (a retry is a second paid call). */
export function review(slot, piece) {
  const issues = [];
  const tags = piece.hashtags || [];
  if (slot.platform === 'x' && [piece.caption, ...tags].join(' ').length > 280) issues.push('longer than 280 characters on X');
  if (slot.kind === 'story' && tags.length) issues.push('stories take no hashtags');
  if (slot.kind !== 'story' && (tags.length < 1 || tags.length > 5)) issues.push('use 1 to 5 hashtags');
  if (tags.some((t) => !t.startsWith('#') || /\s/.test(t))) issues.push('hashtags need # and no spaces');
  if (slot.kind === 'reel' && !piece.script) issues.push('reel without a script');
  if (slot.kind === 'reel' && piece.script) {
    const words = piece.script.replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).length;
    if (words > 85) issues.push(`reel script has ${words} words, too long for 30 seconds`);
  }
  if (slot.format === 'carousel' && (piece.slides.length < 3 || piece.slides.length > 8)) issues.push('carousel needs 3 to 8 slides');
  if (/الأفضل|رقم\s*(1|١|واحد)|مضمون\s*100|100\s*%\s*مضمون/.test(`${piece.caption} ${piece.slides.join(' ')} ${piece.script}`)) issues.push('superlative claim');
  return issues;
}

/**
 * Write every slot in one request. Streaming because a month is a long answer;
 * structured output so each piece comes back in the shape the team works with.
 */
export async function generatePieces(brief, slots, { client = new Anthropic(), model = MODEL, effort = 'medium', signal } = {}) {
  const stream = client.beta.messages.stream({
    model,
    max_tokens: 64000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort, format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userMessage(brief, slots) }],
  }, { signal });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw genError(`the model declined this brief${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}`, 'refused');
  }
  if (message.stop_reason === 'max_tokens') throw genError('the answer was cut off; split the month into smaller briefs', 'truncated');
  const textBlock = message.content.find((block) => block.type === 'text');
  let parsed;
  try {
    parsed = JSON.parse(textBlock?.text || '');
  } catch {
    throw genError('the model did not return valid JSON', 'invalid_output');
  }
  const byId = new Map(parsed.pieces.map((p) => [p.id, p]));
  const items = slots.map((slot) => {
    const piece = byId.get(slot.id);
    if (!piece) return { ...slot, missing: true, issues: ['not written'] };
    return { ...slot, ...piece, id: slot.id, issues: review(slot, piece) };
  });
  return { items, usage: message.usage, model: message.model };
}
