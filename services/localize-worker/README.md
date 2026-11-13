# توطين الإعلانات | Localize worker

Pull worker for `style: "localize"` jobs on the Lines video API. The creative API still never calls a vendor. This worker does:

1. Recompute the duration-based cost estimate and refuse to start if it exceeds `LINES_LOCALIZE_MAX_USD` (default 15).
2. Runway Aleph 2.0 (`POST https://api.dev.runwayml.com/v1/video_to_video`, model `aleph2`) applies the visual swaps from `localize.swaps`. Several swaps are packed into one request when the documented limits allow (prompt ≤ 1000 characters, ≤ 5 keyframes). Poll `GET /v1/tasks/{id}`.
3. If `localize.dub` is true, HeyGen Video Translation Precision (`POST https://api.heygen.com/v3/video-translations`, `mode: "precision"`) translates the result to the documented language name `Arabic (Saudi Arabia)` with lip-sync. Poll `GET /v3/video-translations/{id}`.
4. Download the output and upload the MP4 to the API.

**These are paid vendor calls.** A 30-second ad with the swaps packed into one Aleph pass plus HeyGen Precision is $8.40 + $0.75 = $9.15 at the official rates (Aleph 28 credits/sec at $0.01/credit, 56-credit minimum; HeyGen Precision with lip-sync $0.025/sec). The worker never starts a vendor call when the estimate is over the cap, and it never reports success without an uploaded file.

Studio dialects (`najdi`, `hijazi`, `janoubi`, `sharqawi`, `white`) all map to `Arabic (Saudi Arabia)` because HeyGen does not document those five dialect names as translation targets.

Aleph accepts clips of 2–30 seconds. A 60-second swap job fails with `duration_unsupported` before any paid call.

## Tiers

`localize.tier` picks the pipeline. `pro` (default) is the paid path above. `free` and `economy` run here too, so this worker belongs on the Mac mini when those tiers are on.

- **free** ($0, no watermark): download the source → local Saudi voice for `captions.text` → MuseTalk lip-sync → upload. Swaps fail with `tier_unsupported`. A line longer than the video (+0.5 s) fails with `script_too_long` before lip-sync.
- **economy** (about $2.10 per 30 s): cut the source into clips of 3–15 s with ffmpeg, upload each to Cloud Storage, edit it with Gemini Omni 1.2 Flash (`POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions`, `task: "edit"`, 720p, `background: true`, inline delivery, poll `GET …/interactions/{id}`), join the clips, then the same local voice and lip-sync. Up to two `referenceUrl` images are uploaded and passed as reference images.

Local tools (nothing is installed by this worker; each is an executable path):

| Env | What | Status on the Mac mini |
|---|---|---|
| `LINES_LOCAL_TTS` | `edge` (default) or `namaa` | |
| `LINES_EDGE_TTS_BIN` | `edge-tts` CLI from MoneyPrinterTurbo's environment; voice `LINES_EDGE_VOICE`, default `ar-SA-HamedNeural` (or `ar-SA-ZariyahNeural`) | already used by MoneyPrinterTurbo |
| `LINES_NAMAA_TTS_CMD` | wrapper called as `--text <line> --out <file.wav>` for NAMAA-Saudi-TTS (Chatterbox, MIT) | not installed; needs approval |
| `LINES_MUSETALK_CMD` | wrapper called as `--video <in> --audio <voice> --out <out.mp4>` for MuseTalk 1.5 (MIT; MLX port on Apple Silicon) | not installed; needs approval |
| `LINES_FFMPEG`, `LINES_FFPROBE` | default from PATH | Homebrew ffmpeg (used by the other Mac workers) |

Economy also needs `GEMINI_VERTEX_PROJECT`, `GEMINI_GCS_BUCKET` and a Google OAuth access token (`GOOGLE_OAUTH_ACCESS_TOKEN`, or the file `secrets/google-access-token`, mode 0600). Access tokens are short-lived; refresh the file outside this process (for example a LaunchAgent running `gcloud auth print-access-token`). Never put it in chat or logs.

Edge TTS is Microsoft's online read-aloud voice reached through the open-source `edge-tts` package, not a paid Azure key. It is free and already in use here, but it is not a documented commercial API, the voices lean towards MSA rather than a regional dialect, and it needs the internet. NAMAA-Saudi-TTS is the planned upgrade for real Saudi dialect.

## Keys and env

Never put keys in chat or logs. The worker reads:

- `RUNWAY_API_KEY` (or the official SDK name `RUNWAYML_API_SECRET`, or `secrets/runway-key`)
- `HEYGEN_API_KEY` (or `secrets/heygen-key`)
- `LINES_API_BASE`, worker token (`LINES_WORKER_TOKEN` or `secrets/localize-worker-token`)
- `LINES_LOCALIZE_MAX_USD` (default 15)

Missing keys fail the job with `engine_not_configured`. Do not run this worker against production vendors without approved credit on both accounts. A first live 30-second test is about $9.15 and needs enough prepaid Runway credits and HeyGen API credit; this repository does not purchase either.

Failure codes: `engine_not_configured`, `cost_cap_exceeded`, `duration_unsupported`, `nothing_to_render`, `tier_unsupported`, `script_too_long`, `vendor_auth`, `swap_failed`, `translate_failed`, `tts_failed`, `lipsync_failed`, `render_timeout`, `cancelled`.
