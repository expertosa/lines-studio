# فيديوهات UGC | UGC worker

فيديو بأسلوب «شخص يصوّر نفسه بالجوال ويتكلم عن المنتج». تطلبه التطبيقات من واجهة الفيديو بـ `style: "ugc"`، وهذا العامل يسحب الطلب وينفّذه:

1. يختار المقدّم (صورة + صوت) من `metadata.presenter`.
2. ElevenLabs يقرأ النص `script.text` بصوت المقدّم.
3. OmniHuman 1.5 على fal.ai يحرّك الصورة مع مطابقة الشفايف للصوت.
4. ffmpeg يكتب ترجمة عربية/إنجليزية على الفيديو، ويطلع صورة مصغّرة، ثم يرفعها للواجهة.

Pull worker for `style: "ugc"` jobs on the Lines video API: presenter photo + presenter voice (ElevenLabs TTS) → lip-synced talking head (fal.ai OmniHuman 1.5) → burned-in captions (ffmpeg/libass) → upload.

**These are paid vendor calls.** A 12–15 s clip cost about $2.30 for the lip sync in the manual sample (OmniHuman at 1080p), plus a few cents of TTS. The worker never retries after the lip-sync call, so a failure late in the pipeline does not pay twice.

## Request

```json
{
  "reference": "ugc-001",
  "title": "اكسبرتو — توصية",
  "script": { "text": "تدرون وش اللي غيّر شغلي هالشهر؟ اكسبرتو. كنت أضيّع ساعات على شغل روتيني، الحين الذكاء الاصطناعي يخلّصه عني بدقايق. وإذا عندك منشأة… جرّبه، والله ما راح تندم." },
  "style": "ugc",
  "format": "9:16",
  "language": "ar",
  "seconds": 15,
  "metadata": { "presenter": "yousef" }
}
```

- `script.text` is required (a `prompt` alone is rejected with 422). ElevenLabs audio tags such as `[excited]` are passed to the voice and stripped from the captions.
- `format` is `9:16` only; `seconds` is `15` or `30`. If the spoken script runs longer than `seconds`, the job fails with `script_too_long` **before** the paid lip sync.
- `voice` is always `"presenter"`: the voice belongs to the presenter.
- `metadata.presenter` picks a presenter (default from `presenters.json`); `metadata.captions: "off"` skips the captions.

Failure codes: `script_required`, `script_too_long`, `presenter_unknown`, `presenter_language`, `vendor_not_configured`, `vendor_auth`, `tts_failed`, `lipsync_failed`, `render_timeout`, `cancelled`.

## Presenters

Presenters are a fixed, approved set — the worker never invents a new face per job. Each one is a photo plus an ElevenLabs voice:

```
/Volumes/Data/lines-video-worker/ugc/presenters/
  presenters.json
  yousef.png
```

See `examples/presenters.example.json`. The first presenter, «يوسف», is the man from the manual sample: download the vertical selfie (Seedream 5 Pro, 1152×2048) from the ElevenLabs flow «UGC — اكسبرتو (عيّنة)» and save it as `yousef.png`. His voice is ElevenLabs «Yousef - Warm & Trustworthy» (`nhJWWCFdNdusuVUT3x19`), a library voice: add it to the account's voices in ElevenLabs before the API can use it.

Photo guidance (OmniHuman): one person, front-facing, well lit, face clearly visible, vertical, no text in the image. Only use photos of people who agreed to it, or generated faces.

## Setup on the Mac

```
/Volumes/Data/lines-video-worker/
  ugc/app/            # this directory
  ugc/presenters/     # presenters.json + photos
  ugc/tmp/ ugc/logs/
  secrets/ugc-worker-token   # mode 0600
  secrets/elevenlabs-key     # mode 0600, ElevenLabs API key
  secrets/fal-key            # mode 0600, fal.ai API key
```

```bash
# on the API host
LINES_DATA_DIR=/data node src/keys-cli.js create-worker --id ugc-worker --engines ugc
```

Turn the style on with `LINES_ENABLE_UGC=1` on the API. Copy `launchd/com.lines.ugc-worker.plist` to `~/Library/LaunchAgents/` and `launchctl load` it. The worker refuses to start if a secret file is readable by group or others. Nothing heavy runs locally (only ffmpeg for captions), so it can share the Mac with the other workers; the API still runs one job at a time.

| Env | |
|---|---|
| `LINES_WORKER_ROOT` | required, under `/Volumes/Data` |
| `LINES_API_BASE` | e.g. `https://api.lines.studio` |
| `LINES_WORKER_TOKEN_FILE`, `ELEVENLABS_KEY_FILE`, `FAL_KEY_FILE` | default `<root>/secrets/ugc-worker-token`, `elevenlabs-key`, `fal-key` |
| `UGC_PRESENTERS_DIR` | default `<root>/ugc/presenters` |
| `UGC_TTS_MODEL` | default `eleven_v3` |
| `UGC_RESOLUTION` | `1080p` (default) or `720p` (cheaper) |
| `UGC_FONT_AR`, `UGC_FONT_EN`, `UGC_FONTS_DIR` | caption fonts |
| `UGC_POLL_MS`, `LINES_WORKER_POLL_MS`, `LINES_HEARTBEAT_MS` | defaults 5000 / 5000 / 30000 |

## Vendor calls

- ElevenLabs: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, header `xi-api-key`, body `{ text, model_id }`.
- fal.ai queue: `POST https://queue.fal.run/fal-ai/bytedance/omnihuman/v1.5` with `Authorization: Key …` and `{ image_url, audio_url, prompt, resolution }`, then poll `status_url` until `COMPLETED` and read `video.url` from `response_url`. The photo and the audio are sent as base64 data URIs, so nothing is hosted publicly.
- The fal key is only sent to `queue.fal.run`; the video is only downloaded from fal media hosts over HTTPS.

These request shapes come from the vendors' public docs as summarised by search. The docs could not be opened from the build environment, so **check them on the first real job** (especially that fal accepts data URIs for both inputs, and that `eleven_v3` is available to the key).

## Tests

```bash
npm test     # fake ElevenLabs + fal; real ffmpeg for the audio check and captions. No keys, no spend.
npm run lint
```
