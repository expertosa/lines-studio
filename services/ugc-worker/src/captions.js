/**
 * Burned-in captions, UGC style: short chunks (a few words), bold, centred in
 * the lower third, timed proportionally to the spoken audio. libass shapes
 * Arabic and handles RTL.
 */
export const DEFAULT_FONTS = Object.freeze({ ar: 'Noto Naskh Arabic', en: 'DejaVu Sans' });

/** Shown for the whole clip, always: viewers must be able to tell the presenter is AI-generated. */
export const AI_LABEL = Object.freeze({ ar: 'مولّد بالذكاء الاصطناعي', en: 'AI-generated' });

function assTime(seconds) {
  const cs = Math.max(0, Math.round(seconds * 100));
  const s = Math.floor(cs / 100) % 60;
  const m = Math.floor(cs / 6000) % 60;
  const h = Math.floor(cs / 360000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs % 100).padStart(2, '0')}`;
}

function escape(text) {
  return String(text).replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}');
}

/** Strip ElevenLabs audio tags like [excited] and split into chunks of about `words` words, breaking at punctuation. */
export function chunkScript(text, words = 4) {
  const clean = String(text).replace(/\[[^\]]{1,40}\]/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = clean ? clean.split(' ') : [];
  const chunks = [];
  let current = [];
  for (const token of tokens) {
    current.push(token);
    if (current.length >= words || /[.!?؟،,…]$/.test(token)) {
      chunks.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) chunks.push(current.join(' '));
  return chunks;
}

export function buildCaptions(text, { duration, width, height, language, font, captions = true }) {
  const chunks = captions ? chunkScript(text) : [];
  const weights = chunks.map((chunk) => chunk.replace(/\s/g, '').length + 2);
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const lead = Math.min(0.15, duration * 0.02);
  const usable = Math.max(0.5, duration - lead);
  const family = font || DEFAULT_FONTS[language] || DEFAULT_FONTS.en;
  const size = Math.round(Math.min(width, height) * 0.075);
  let cursor = lead;
  const events = chunks.map((chunk, index) => {
    const span = (usable * weights[index]) / total;
    const line = `Dialogue: 0,${assTime(cursor)},${assTime(cursor + span)},Cap,,0,0,0,,{\\fad(60,40)}${escape(chunk)}`;
    cursor += span;
    return line;
  });
  const label = AI_LABEL[language] || AI_LABEL.en;
  events.unshift(`Dialogue: 1,${assTime(0)},${assTime(duration)},Label,,0,0,0,,${escape(label)}`);
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Cap,${family},${size},&H00FFFFFF,&H000000FF,&H00101010,&H80000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(size * 0.09))},2,2,${Math.round(width * 0.08)},${Math.round(width * 0.08)},${Math.round(height * 0.22)},1`,
    `Style: Label,${family},${Math.round(Math.min(width, height) * 0.03)},&H30FFFFFF,&H000000FF,&H00101010,&H90000000,0,0,0,0,100,100,0,0,3,${Math.max(4, Math.round(width * 0.008))},0,9,${Math.round(width * 0.05)},${Math.round(width * 0.05)},${Math.round(height * 0.04)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
    '',
  ].join('\n');
}
