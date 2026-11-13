# توطين الإعلانات | Localize worker

Pull worker for `style: "localize"` jobs on the Lines video API. The creative API still never calls a vendor. This worker does:

1. Recompute the duration-based cost estimate and refuse to start if it exceeds `LINES_LOCALIZE_MAX_USD` (default 15).
2. Runway Aleph 2.0 (`POST https://api.dev.runwayml.com/v1/video_to_video`, model `aleph2`) applies the visual swaps from `localize.swaps`. Several swaps are packed into one request when the documented limits allow (prompt ≤ 1000 characters, ≤ 5 keyframes). Poll `GET /v1/tasks/{id}`.
3. If `localize.dub` is true, HeyGen Video Translation Precision (`POST https://api.heygen.com/v3/video-translations`, `mode: "precision"`) translates the result to the documented language name `Arabic (Saudi Arabia)` with lip-sync. Poll `GET /v3/video-translations/{id}`.
4. Download the output and upload the MP4 to the API.

**These are paid vendor calls.** A 30-second ad with the swaps packed into one Aleph pass plus HeyGen Precision is $8.40 + $0.75 = $9.15 at the official rates (Aleph 28 credits/sec at $0.01/credit, 56-credit minimum; HeyGen Precision with lip-sync $0.025/sec). The worker never starts a vendor call when the estimate is over the cap, and it never reports success without an uploaded file.

Studio dialects (`najdi`, `hijazi`, `janoubi`, `sharqawi`, `white`) all map to `Arabic (Saudi Arabia)` because HeyGen does not document those five dialect names as translation targets.

Aleph accepts clips of 2–30 seconds. A 60-second swap job fails with `duration_unsupported` before any paid call.

## Keys and env

Never put keys in chat or logs. The worker reads:

- `RUNWAY_API_KEY` (or the official SDK name `RUNWAYML_API_SECRET`, or `secrets/runway-key`)
- `HEYGEN_API_KEY` (or `secrets/heygen-key`)
- `LINES_API_BASE`, worker token (`LINES_WORKER_TOKEN` or `secrets/localize-worker-token`)
- `LINES_LOCALIZE_MAX_USD` (default 15)

Missing keys fail the job with `engine_not_configured`. Do not run this worker against production vendors without approved credit on both accounts. A first live 30-second test is about $9.15 and needs enough prepaid Runway credits and HeyGen API credit; this repository does not purchase either.

Failure codes: `engine_not_configured`, `cost_cap_exceeded`, `duration_unsupported`, `nothing_to_render`, `vendor_auth`, `swap_failed`, `translate_failed`, `render_timeout`, `cancelled`.
