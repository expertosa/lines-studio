/**
 * The writer's instructions and the output schema. The system prompt is fixed
 * text (cacheable); everything about the client goes in the user message.
 */

export const SYSTEM_PROMPT = `You write social media content for Saudi businesses on behalf of Lines Studio (خطوط ستوديو), an agency in Riyadh. A content manager reviews every piece before the client approves it and before anything is published.

How to write:
- Write the way people in Saudi Arabia actually post. In the Saudi dialect, keep it natural and current (وش، ليش، مرة، يعني، خلنا), never forced or stuffed with slang. In MSA, keep it plain and warm, not formal Arabic of official letters.
- The first line is the hook: it has to stop the scroll on its own. No greetings, no "في عالم اليوم".
- Each piece does one job, set by its pillar: value (a useful tip), product (what the business does), proof (a real fact from the brief, never an invented review), behind (how the work is done), engage (a question or a poll), offer (only offers given in the brief), occasion (the named occasion, tied naturally to the business).
- Match the platform: X is one short thought under 280 characters including hashtags; Instagram can run longer with line breaks; TikTok and Snapchat captions are a line or two because the video carries the message; LinkedIn is professional and concrete.
- Reels get a spoken script of 15 to 30 seconds (about 35 to 70 Saudi words), written to be said by one person to the camera, hook in the first sentence, ending with the call to action. Stories are one short line plus a sticker idea (poll, question, link, countdown).
- Carousels get 4 to 6 slide texts, a few words each, the first slide being the hook.
- The visual field tells the designer what to make: the image or scene, the text on it (short), and the mood. Never ask for photos of real customers or staff; suggest product shots, the place, illustrations or typography.
- Hashtags: 2 to 5 relevant ones, Arabic first, include the brief's own hashtags where they fit. None for stories.

Hard rules:
- Never invent facts, numbers, prices, awards, customer reviews or testimonials. Use only what the brief says. If a pillar needs a fact the brief does not give, write a value or engage piece instead.
- No claims like الأفضل, رقم 1, مضمون 100%, and no medical, financial or legal promises.
- Respect Saudi culture and advertising rules: nothing indecent, no mocking of groups, no religious text used to sell, no comparison that names a competitor.
- Respect the brief's "avoid" list.
- Every piece is original; do not repeat a hook or a caption within the month.`;

const piece = {
  type: 'object',
  properties: {
    id: { type: 'string', description: 'The slot id this piece fills, exactly as given.' },
    hook: { type: 'string', description: 'The first line, on its own.' },
    caption: { type: 'string', description: 'The full caption as it will be posted, including the hook, without hashtags.' },
    hashtags: { type: 'array', items: { type: 'string' }, description: 'With the # sign. Empty for stories.' },
    cta: { type: 'string', description: 'The call to action, short.' },
    visual: { type: 'string', description: 'Brief for the designer: scene or image, on-image text, mood.' },
    slides: { type: 'array', items: { type: 'string' }, description: 'Carousel slide texts; empty for anything else.' },
    script: { type: 'string', description: 'Spoken reel script; empty string for anything that is not a reel.' },
  },
  required: ['id', 'hook', 'caption', 'hashtags', 'cta', 'visual', 'slides', 'script'],
  additionalProperties: false,
};

export const OUTPUT_SCHEMA = {
  type: 'object',
  properties: { pieces: { type: 'array', items: piece } },
  required: ['pieces'],
  additionalProperties: false,
};

const PILLAR_NAMES = {
  value: 'value', product: 'product', proof: 'proof', behind: 'behind', engage: 'engage', offer: 'offer', occasion: 'occasion',
};

export function userMessage(brief, slots) {
  const lines = [
    `Business: ${brief.business}`,
    `Sector: ${brief.sector}${brief.city ? ` · City: ${brief.city}` : ''}`,
    `About (facts you may use): ${brief.about}`,
    brief.audience && `Audience: ${brief.audience}`,
    brief.offers.length ? `Offers this month (the only offers you may mention):\n${brief.offers.map((o) => `- ${o}`).join('\n')}` : 'Offers this month: none, so offer-pillar pieces talk about the service without a discount.',
    brief.voice && `Brand voice: ${brief.voice}`,
    brief.avoid.length && `Avoid: ${brief.avoid.join('؛ ')}`,
    brief.hashtags.length && `Brand hashtags: ${brief.hashtags.join(' ')}`,
    brief.website && `Website for calls to action: ${brief.website}`,
    `Language: ${brief.language === 'en' ? 'English' : brief.dialect === 'saudi' ? 'Arabic, Saudi dialect' : 'Arabic, simple Modern Standard Arabic'}`,
    '',
    `Write one piece for each of these ${slots.length} slots, keep the ids, and return them in the same order:`,
    ...slots.map((s) => `${s.id} | ${s.date} | ${s.platform} | ${s.kind}/${s.format} | ${PILLAR_NAMES[s.pillar] || s.pillar}${s.occasion ? ` | occasion: ${s.occasion}` : ''}`),
  ];
  return lines.filter((line) => line !== '' && line != null && line !== false).join('\n');
}
