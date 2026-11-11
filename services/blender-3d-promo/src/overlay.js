/**
 * Typography layer. Blender renders the 3D plate without text; ffmpeg burns
 * this ASS file on top with libass, which shapes Arabic and handles RTL.
 */

export const DEFAULT_FONTS = Object.freeze({
  ar: 'Noto Naskh Arabic',
  en: 'DejaVu Sans',
});

/** "#RRGGBB" -> ASS "&HAABBGGRR" (alpha 00 = opaque). */
export function assColor(hex, alpha = 0) {
  const value = String(hex).replace('#', '');
  const a = Math.max(0, Math.min(255, alpha)).toString(16).padStart(2, '0');
  return `&H${a}${value.slice(4, 6)}${value.slice(2, 4)}${value.slice(0, 2)}`.toUpperCase();
}

export function assTime(seconds) {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const s = Math.floor(totalCs / 100) % 60;
  const m = Math.floor(totalCs / 6000) % 60;
  const h = Math.floor(totalCs / 360000);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

export function assEscape(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\r?\n/g, '\\N');
}

export function buildOverlay(spec, { fonts = {} } = {}) {
  const { width: w, height: h, palette } = spec;
  const family = fonts[spec.language] || DEFAULT_FONTS[spec.language] || DEFAULT_FONTS.en;
  const unit = Math.min(w, h);
  const text = assColor(palette.text);
  const shadow = assColor(palette.background, 0x50);
  const style = (name, size, bold, align, marginV, primary = text, outline = 0, back = shadow, border = 1) =>
    `Style: ${name},${family},${Math.round(size)},${primary},&H000000FF,${back},${back},${bold ? -1 : 0},0,0,0,100,100,0,0,${border},${outline},2,${align},${Math.round(w * 0.06)},${Math.round(w * 0.06)},${Math.round(marginV)},1`;

  const lines = [];
  const dialogue = (start, end, styleName, body) => {
    if (end - start < 0.2) return;
    lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},${styleName},,0,0,0,,${body}`);
  };
  const rise = (x, y, by = unit * 0.03) => `\\move(${Math.round(x)},${Math.round(y + by)},${Math.round(x)},${Math.round(y)},0,450)`;

  const outro = spec.scenes[spec.scenes.length - 1];
  for (const scene of spec.scenes) {
    if (scene === outro || !scene.text) continue;
    const y = h * 0.88;
    dialogue(scene.start + 0.25, scene.end - 0.1, 'Caption', `{\\an2${rise(w / 2, y)}\\fad(350,250)}${assEscape(scene.text)}`);
  }

  const t0 = outro.start + 0.2;
  const t1 = spec.seconds;
  const titleY = h * 0.76;
  if (!spec.title3d) {
    // The 3D title replaces this one when Blender renders it.
    dialogue(t0, t1, 'Title', `{\\an5${rise(w / 2, titleY)}\\fad(400,0)}${assEscape(spec.title)}`);
    const barW = Math.round(unit * 0.16);
    const barH = Math.max(3, Math.round(unit * 0.006));
    dialogue(t0 + 0.3, t1, 'Bar',
      `{\\an5\\pos(${Math.round(w / 2)},${Math.round(titleY + unit * 0.065)})\\fscx0\\t(0,500,\\fscx100)\\bord0\\shad0\\p1}m 0 0 l ${barW} 0 ${barW} ${barH} 0 ${barH}{\\p0}`);
  }
  if (spec.tagline && !spec.scenes.some((scene) => scene.text)) {
    dialogue(t0 + 0.45, t1, 'Tag', `{\\an5${rise(w / 2, h * 0.85)}\\fad(400,0)}${assEscape(spec.tagline)}`);
  }
  if (spec.cta) {
    dialogue(t0 + 0.7, t1, 'Cta', `{\\an5${rise(w / 2, h * 0.92)}\\fad(300,0)}${assEscape(spec.cta)}`);
  }
  dialogue(0.4, t1, 'Brand', `{\\an8\\fad(600,0)}${assEscape(spec.brand)}`);

  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    style('Caption', unit * 0.05, true, 2, h * 0.08),
    style('Title', unit * 0.085, true, 5, 0),
    style('Bar', unit * 0.02, false, 5, 0, assColor(palette.primary)),
    style('Tag', unit * 0.042, false, 5, 0),
    style('Cta', unit * 0.04, true, 5, 0, assColor(palette.background), Math.round(unit * 0.018), assColor(palette.primary), 3),
    style('Brand', unit * 0.032, true, 8, h * 0.045, assColor(palette.primary)),
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...lines,
    '',
  ].join('\n');
}
