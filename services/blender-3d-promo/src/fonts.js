import fs from 'node:fs';

/**
 * Fonts for the extruded 3D title. Blender reads the font file directly and
 * blender/arabic.py emits Arabic Presentation Forms-B, so the font must cover
 * U+FE70–U+FEFC. These do; set PROMO_FONT_3D (a .ttf/.otf path) to choose another.
 */
export const FONT_3D_CANDIDATES = Object.freeze([
  '/System/Library/Fonts/Supplemental/Arial Unicode.ttf',
  '/Library/Fonts/Arial Unicode.ttf',
  '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
  '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
  '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
]);

export function resolve3dFont(override, exists = fs.existsSync) {
  if (override) return exists(override) ? override : null;
  return FONT_3D_CANDIDATES.find((file) => exists(file)) || null;
}
