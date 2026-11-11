# فيديوهات ترويجية ثلاثية الأبعاد بالكود | 3D promo videos in code (Blender)

مشروع داخل خطوط ستوديو يصنع فيديو ترويجي ثلاثي الأبعاد كامل من ملف JSON، بدون فتح Blender ولا تصميم يدوي. الكود يبني المشهد كله (جوال أو لابتوب أو كرة بشعار)، ويحرّك الكاميرا بين لقطات، ويرسم «الخطوط» المضيئة حول المنتج، ثم يكتب النص العربي أو الإنجليزي فوق الفيديو.

A Lines Studio project that turns a JSON brief into a finished 3D promo video. Python (`bpy`) builds the whole Blender scene procedurally; ffmpeg burns the typography on top with libass so Arabic is shaped correctly; Node ties it together as a CLI and as a pull worker for the Lines video API (`style: "promo3d"`).

```
brief.json ──► src/spec.js ──► spec.json ──► Blender (blender/promo3d.py) ──► frame_####.png
                                  │                                                │
                                  └──► src/overlay.js ──► overlay.ass ──► ffmpeg ◄─┘ (+ music)
                                                                            │
                                                                promo.mp4 + promo.jpg
```

## المتطلبات | Requirements

- Blender 4.2 LTS أو أحدث (يشتغل على 3.6 إلى 5.x). على الماك: `/Applications/Blender.app/Contents/MacOS/Blender`.
- ffmpeg مع libass (`brew install ffmpeg`).
- Node 22.13+.
- خط عربي مثبت في النظام، مثل Noto Naskh Arabic أو IBM Plex Sans Arabic أو Tajawal.

No npm dependencies.

## الاستخدام | Usage

```bash
cd services/blender-3d-promo
export BLENDER_BIN=/Applications/Blender.app/Contents/MacOS/Blender

# لقطة واحدة للمعاينة (بدون نص) — ثواني
node src/cli.js examples/experto-ar.json --still 90 --quality draft

# مسودة سريعة: نصف الدقة
node src/cli.js examples/experto-ar.json --quality draft

# النسخة النهائية + موسيقى + حفظ ملف .blend للتعديل اليدوي
node src/cli.js examples/lines-studio-en.json --music ~/music/upbeat.mp3 --save-blend
```

The video lands in `out/<brief>.mp4` with a thumbnail `out/<brief>.jpg` (`out/` is git-ignored). From the repo root: `npm run promo3d -- services/blender-3d-promo/examples/experto-ar.json`.

Without the Blender app you can use the `bpy` wheel (Python 3.11): `pip install bpy==4.2.*`, then `--python /path/to/venv/bin/python`. On a machine with no GPU use `--engine cycles` (EEVEE needs OpenGL/Metal).

| Option | |
|---|---|
| `--quality draft\|final` | draft = 50% resolution and fewer samples; final = full 1080p, depth of field |
| `--engine eevee\|cycles\|workbench` | EEVEE is the default (fast on Apple Silicon) |
| `--format`, `--seconds` | override the brief |
| `--still <frame>` | render one frame to `out/<brief>-frame<N>.png` |
| `--music <file>` | looped, faded in and out |
| `--save-blend` | keep the generated scene as `out/<brief>.blend` |
| `--spec-only` | print the resolved spec |

Env: `BLENDER_BIN`, `BPY_PYTHON`, `FFMPEG_BIN`, `PROMO_FONT_AR`, `PROMO_FONT_EN` (font family names for the text layer), `PROMO_FONT_3D` (font file for the 3D title).

## ملف البريف | Brief

```json
{
  "title": "اكسبرتو",
  "captions": [
    { "text": "نساعد منشأتك تتحول بالذكاء الاصطناعي", "seconds": 4 },
    { "text": "حلول جاهزة، وتنفيذ سريع" }
  ],
  "brand": "خطوط ستوديو",
  "cta": "اطلب عرضك الآن",
  "format": "9:16",
  "seconds": 15,
  "hero": { "type": "phone", "image": "../../../public/work/experto.webp", "focus": 0.85 },
  "palette": "#101828,#A78BFA,#4FD1C5,#FFFFFF",
  "quality": "final"
}
```

| Field | Values |
|---|---|
| `title` | required. Shown big in the outro |
| `captions` | strings or `{ text, seconds }`, up to 5. Or `narration` / `tagline` and it is split on sentences |
| `format` | `9:16` (Reels/TikTok), `16:9` (YouTube), `1:1` (feed) |
| `seconds` | 5–120, default 15. The outro takes ~25% (min 3s) |
| `hero.type` | `phone`, `laptop` (lid opens in the first shot), `orb` (brand sphere with rings). Default: laptop for 16:9, phone otherwise |
| `hero.image` | screenshot shown on the device screen, path relative to the brief. Cover-fitted, top of the page kept |
| `hero.focus` | 0 = keep the left of a wide screenshot, 1 = the right. Default 0.85 for Arabic (RTL hero), 0.5 otherwise |
| `palette` | `"#bg,#primary,#accent,#text"` or an object with those keys. Default is the Lines palette |
| `brand`, `cta`, `tagline` | outro text |
| `language` | `ar` / `en`; detected from the text if missing |
| `fps` | 24, 25, 30 (default), 60 |
| `title3d` | `false` to use the flat title instead of the extruded 3D one |
| `explode` | `false` to skip the exploded-UI moment |
| `quality`, `renderEngine`, `seed` | see options; `seed` changes the line layout |

Shots run in order: `reveal` (push in) → `orbit` → `close` → `detail` … → `outro`. Hard cuts between shots, eased motion inside each one.

- **Exploded UI:** in the first close/detail scene the camera swings to a three-quarter view and three slices of the screenshot (top bar, headline, call to action) lift off the screen toward the camera, hold, and settle back.
- **3D title:** in the outro the title is an extruded, bevelled, metallic text object that flips up into place. Arabic is shaped by `blender/arabic.py` (contextual forms, lam-alef, RTL order), so the font must include Arabic Presentation Forms-B. Set `PROMO_FONT_3D` to a font file; otherwise Arial Unicode / Arial Bold (macOS) or DejaVu Sans Bold (Linux) is used. With no suitable font the flat 2D title is used.
- **Emblem lines:** the orbiting lines retract and parallel strokes sweep in behind the 3D title (right-to-left for Arabic).

## كيف ينبني المشهد | What the scene script does

`blender/promo3d.py` starts from an empty factory scene and creates everything in code:

- dark reflective floor, podium with a glowing ring, world colour from the palette;
- the hero model (bevelled phone, laptop with a hinged lid, or metallic orb with spinning rings) with the screenshot as an emissive screen;
- 10–14 glowing bezier "lines" in the primary/accent colours that draw themselves on behind the hero (`bevel_factor_end` keyframes), framing it without crossing the screen — the خطوط motif;
- exploded UI layers, the extruded 3D title and the emblem strokes described above;
- floating dust particles, three-point area lighting tinted by the palette;
- a camera with a Track-To target, keyframed per scene, with depth of field in `final`;
- compositor glare for bloom where the Blender version supports it.

Blender text objects do not join Arabic letters, so the only text Blender renders is the 3D title, pre-shaped by `blender/arabic.py`. Everything else comes from `src/overlay.js`, which writes an ASS file (captions with fade/rise, CTA pill, brand mark, and the flat title when there is no 3D one). ffmpeg/libass renders it with proper shaping and RTL.

## عبر واجهة الفيديو | Through the Lines video API

Apps that already call `api.lines.studio` can ask for a 3D promo with `style: "promo3d"`:

```json
{
  "reference": "order-2001",
  "title": "اكسبرتو",
  "script": { "scenes": [{ "text": "نساعد منشأتك تتحول بالذكاء الاصطناعي" }, { "text": "من الفكرة إلى الإطلاق" }] },
  "style": "promo3d",
  "format": "9:16",
  "language": "ar",
  "seconds": 15,
  "metadata": { "hero": "phone", "heroAsset": "experto.webp", "palette": "#101828,#A78BFA,#4FD1C5", "cta": "اطلب عرضك الآن" }
}
```

- The style is listed only when the API runs with `LINES_ENABLE_BLENDER=1`, so jobs never wait for a worker that does not exist.
- `metadata.heroAsset` is a file name inside the worker's `assets/` folder. The worker never downloads images from URLs.
- `voice` is accepted for contract compatibility; promo3d videos have no narration (music only, if configured).

### Worker on the Mac mini

Same rules as the MoneyPrinter worker: everything lives on `/Volumes/Data`, the API never connects to the Mac.

```
/Volumes/Data/lines-video-worker/
  blender/
    app/          # this directory
    assets/       # screenshots and logos referenced by metadata.heroAsset
    tmp/ cache/ logs/
  secrets/blender-worker-token   # mode 0600, one line
```

```bash
# on the API host
LINES_DATA_DIR=/data node src/keys-cli.js create-worker --id mac-blender --engines blender
```

Put the printed token in `secrets/blender-worker-token`, copy `launchd/com.lines.blender-promo-worker.plist` to `~/Library/LaunchAgents/`, then `launchctl load` it.

| Env | |
|---|---|
| `LINES_WORKER_ROOT` | required, under `/Volumes/Data` |
| `LINES_API_BASE` | e.g. `https://api.lines.studio` |
| `LINES_WORKER_TOKEN_FILE` | inside the root (preferred) or `LINES_WORKER_TOKEN` |
| `BLENDER_BIN` | default `/Applications/Blender.app/Contents/MacOS/Blender` |
| `PROMO_QUALITY` | `final` (default) or `draft` |
| `PROMO_ASSETS_DIR` | default `<root>/blender/assets` |
| `PROMO_MUSIC` | optional music file inside the root |
| `PROMO_FONT_AR`, `PROMO_FONT_EN`, `PROMO_FONTS_DIR` | text layer fonts |
| `PROMO_FONT_3D` | font file for the 3D title (needs Arabic presentation forms) |
| `LINES_WORKER_POLL_MS`, `LINES_HEARTBEAT_MS` | defaults 5000 / 30000 |

The API keeps one render at a time (`LINES_MAX_CONCURRENCY=1`), so the Blender and MoneyPrinter workers share the Mac without competing.

## Tests

```bash
npm test     # no Blender needed: a fake Blender writes test frames, ffmpeg does the rest
npm run lint # node --check + python -m py_compile
```

Render times on CPU-only Cycles (no GPU) are about 8 s per draft frame; EEVEE on an Apple Silicon Mac mini is far faster. Use `--still` and `--quality draft` while iterating.
