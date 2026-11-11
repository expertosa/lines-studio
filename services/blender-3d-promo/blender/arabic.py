"""Minimal Arabic shaping for Blender text objects (stdlib only).

Blender lays text out left-to-right and never joins Arabic letters. This maps
each letter to its contextual presentation form (U+FE70–U+FEFC), applies the
lam-alef ligatures, and reorders runs so the visual order is right-to-left.
The font must include Arabic Presentation Forms-B (DejaVu Sans, Arial,
Arial Unicode, Noto Sans Arabic UI and most system Arabic fonts do).
"""

# letter: (isolated, final, initial, medial); two-form letters never join forward.
FORMS = {
    "ء": (0xFE80,),
    "آ": (0xFE81, 0xFE82),
    "أ": (0xFE83, 0xFE84),
    "ؤ": (0xFE85, 0xFE86),
    "إ": (0xFE87, 0xFE88),
    "ئ": (0xFE89, 0xFE8A, 0xFE8B, 0xFE8C),
    "ا": (0xFE8D, 0xFE8E),
    "ب": (0xFE8F, 0xFE90, 0xFE91, 0xFE92),
    "ة": (0xFE93, 0xFE94),
    "ت": (0xFE95, 0xFE96, 0xFE97, 0xFE98),
    "ث": (0xFE99, 0xFE9A, 0xFE9B, 0xFE9C),
    "ج": (0xFE9D, 0xFE9E, 0xFE9F, 0xFEA0),
    "ح": (0xFEA1, 0xFEA2, 0xFEA3, 0xFEA4),
    "خ": (0xFEA5, 0xFEA6, 0xFEA7, 0xFEA8),
    "د": (0xFEA9, 0xFEAA),
    "ذ": (0xFEAB, 0xFEAC),
    "ر": (0xFEAD, 0xFEAE),
    "ز": (0xFEAF, 0xFEB0),
    "س": (0xFEB1, 0xFEB2, 0xFEB3, 0xFEB4),
    "ش": (0xFEB5, 0xFEB6, 0xFEB7, 0xFEB8),
    "ص": (0xFEB9, 0xFEBA, 0xFEBB, 0xFEBC),
    "ض": (0xFEBD, 0xFEBE, 0xFEBF, 0xFEC0),
    "ط": (0xFEC1, 0xFEC2, 0xFEC3, 0xFEC4),
    "ظ": (0xFEC5, 0xFEC6, 0xFEC7, 0xFEC8),
    "ع": (0xFEC9, 0xFECA, 0xFECB, 0xFECC),
    "غ": (0xFECD, 0xFECE, 0xFECF, 0xFED0),
    "ف": (0xFED1, 0xFED2, 0xFED3, 0xFED4),
    "ق": (0xFED5, 0xFED6, 0xFED7, 0xFED8),
    "ك": (0xFED9, 0xFEDA, 0xFEDB, 0xFEDC),
    "ل": (0xFEDD, 0xFEDE, 0xFEDF, 0xFEE0),
    "م": (0xFEE1, 0xFEE2, 0xFEE3, 0xFEE4),
    "ن": (0xFEE5, 0xFEE6, 0xFEE7, 0xFEE8),
    "ه": (0xFEE9, 0xFEEA, 0xFEEB, 0xFEEC),
    "و": (0xFEED, 0xFEEE),
    "ى": (0xFEEF, 0xFEF0),
    "ي": (0xFEF1, 0xFEF2, 0xFEF3, 0xFEF4),
}

# lam + alef variant -> (isolated, final)
LAM_ALEF = {
    "آ": (0xFEF5, 0xFEF6),
    "أ": (0xFEF7, 0xFEF8),
    "إ": (0xFEF9, 0xFEFA),
    "ا": (0xFEFB, 0xFEFC),
}

LAM = "ل"
TATWEEL = "ـ"


def is_transparent(char):
    """Harakat and other marks do not break joining."""
    code = ord(char)
    return 0x064B <= code <= 0x065F or code == 0x0670 or 0x06D6 <= code <= 0x06ED


def is_arabic(char):
    code = ord(char)
    return 0x0600 <= code <= 0x06FF or 0xFB50 <= code <= 0xFDFF or 0xFE70 <= code <= 0xFEFF


def joins_forward(char):
    return char == TATWEEL or (char in FORMS and len(FORMS[char]) == 4)


def joins_backward(char):
    return char == TATWEEL or (char in FORMS and len(FORMS[char]) > 1)


def _neighbour(chars, index, step):
    index += step
    while 0 <= index < len(chars) and is_transparent(chars[index]):
        index += step
    return chars[index] if 0 <= index < len(chars) else None


def shape(text):
    """Logical-order Arabic -> contextual presentation forms (still logical order)."""
    chars = list(text)
    out = []
    i = 0
    while i < len(chars):
        char = chars[i]
        if char not in FORMS:
            out.append(char)
            i += 1
            continue
        prev = _neighbour(chars, i, -1)
        joined_prev = prev is not None and joins_forward(prev) and joins_backward(char)
        nxt = _neighbour(chars, i, 1)
        if char == LAM and nxt in LAM_ALEF:
            out.append(chr(LAM_ALEF[nxt][1 if joined_prev else 0]))
            # skip the alef (and any marks between, which stay before it)
            j = i + 1
            while chars[j] != nxt:
                out.append(chars[j])
                j += 1
            i = j + 1
            continue
        joined_next = nxt is not None and joins_forward(char) and joins_backward(nxt)
        forms = FORMS[char]
        if joined_prev and joined_next:
            out.append(chr(forms[3]))
        elif joined_prev:
            out.append(chr(forms[1]))
        elif joined_next:
            out.append(chr(forms[2]))
        else:
            out.append(chr(forms[0]))
        i += 1
    return "".join(out)


def visual(text):
    """Shape, then reorder for a left-to-right renderer.

    Paragraph direction is RTL when the text contains Arabic. Runs of Latin
    letters and digits keep their own order; everything else is reversed.
    """
    shaped = shape(text)
    if not any(is_arabic(c) for c in shaped):
        return shaped
    runs = []
    for char in shaped:
        ltr = char.isascii() and char.isalnum()
        if runs and runs[-1][0] == ltr:
            runs[-1][1].append(char)
        else:
            runs.append([ltr, [char]])
    # spaces/punctuation between two LTR runs belong to that LTR span
    merged = []
    for index, (ltr, chars) in enumerate(runs):
        if (not ltr and merged and merged[-1][0] and index + 1 < len(runs) and runs[index + 1][0]
                and all(not is_arabic(c) for c in chars)):
            merged[-1][1].extend(chars)
            continue
        if merged and merged[-1][0] == ltr:
            merged[-1][1].extend(chars)
        else:
            merged.append([ltr, chars])
    pieces = []
    for ltr, chars in reversed(merged):
        pieces.append("".join(chars) if ltr else "".join(reversed(chars)))
    return "".join(pieces)
