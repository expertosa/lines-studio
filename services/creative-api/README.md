# Lines video API

Shared server-to-server API for short videos. experto-web, and any other Experto app, calls it with its own bearer key. Mobile apps never hold a key and never call this host; they call their own backend, which calls here.

The public marketing site stays a static Next.js export. This process is a separate Coolify app (target `api.lines.studio`).

Generation today is pull-based. The API queues a job. A worker on the owner's Mac mini claims it and runs [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) locally (LLM script when the caller did not send one, Edge TTS, Pixabay stock). The API never opens a connection to the Mac or to Pixabay. An external generative vendor can be added later behind `src/engines/external.js` without changing the HTTP contract.

`style: "template"` is a built-in ffmpeg title card used for tests and as a local fallback. It is not a generative video.

## Auth

`Authorization: Bearer <app key>`. One key per consuming app (the tenant). Keys are stored as SHA-256 hashes. The plaintext is printed once by the key CLI and is never accepted in the query string. There is no CORS header.

Scopes, not implied by each other: `jobs:write`, `jobs:read`, `jobs:cancel`, `artifacts:read`, `usage:read`.

Optional `X-End-User-Id` is stored on the job. It is not an authorization boundary. Another tenant gets **404** for a job id it does not own.

Worker tokens are separate, scope `worker:run` only, and can only call `/v1/worker/*`.

Each tenant has its own webhook secret, used only to sign callbacks.

## Endpoints

| Method | Path | Auth |
|---|---|---|
| GET | `/v1/health` | none |
| GET | `/v1/styles` | `jobs:read` |
| GET | `/v1/quote?seconds=&style=` | `jobs:read` |
| POST | `/v1/jobs` | `jobs:write` + `Idempotency-Key` |
| GET | `/v1/jobs?status=&cursor=` | `jobs:read` |
| GET | `/v1/jobs/:id` | `jobs:read` |
| POST | `/v1/jobs/:id/cancel` | `jobs:cancel` |
| GET | `/v1/jobs/:id/artifacts/:artifactId` | `artifacts:read`, or a short-lived `exp` + `sig` query |
| GET | `/v1/usage?from=&to=` | `usage:read` |
| POST | `/v1/worker/claim` | `worker:run` |
| POST | `/v1/worker/jobs/:id/heartbeat` | `worker:run` |
| POST | `/v1/worker/jobs/:id/artifacts` | `worker:run` multipart |
| POST | `/v1/worker/jobs/:id/complete` | `worker:run` |
| POST | `/v1/worker/jobs/:id/fail` | `worker:run` |

`GET /v1/health` stays **200** with `ok: true` while this process is up and willing to take traffic, including when no Mac is connected and while it is still waiting for the data lock (`ready: false`, `lock: "waiting"`). After it holds the lock, `ready` is true and `lock` is `"held"`. A process that already handed the lock off and was restarted answers **503** on `/v1/health` (`lock: "yielded"`) so it is not put back in rotation. `engines.moneyprinter.ready` is true only when a worker whose engines include `moneyprinter` has successfully called `/v1/worker/claim` or a worker heartbeat within `2 * LINES_LEASE_MS`. `engines.moneyprinter.worker` is `online` or `offline`. The timestamp is in memory, so a restart looks offline until the next poll (the Mac worker polls every few seconds). Other routes answer **503** `starting` until the lock is held.

Every response sends `Strict-Transport-Security: max-age=31536000; includeSubDomains`.

A **401** is counted per client network. IPv4 addresses are counted one by one. IPv6 addresses in the same /64 share one bucket, so rotating the interface id does not reset the limit. After 10 failures in 10 minutes, later requests from that network get **429** `rate_limited` with `Retry-After`, except `GET /v1/health`. Forwarded headers are read only when `LINES_TRUST_PROXY=1` and the TCP peer is a trusted proxy: loopback, link-local, CGNAT, or private by default, or an address in `LINES_TRUSTED_PROXIES` when that list is set (the list replaces the private ranges). The client address is then `CF-Connecting-IP`, then `X-Real-IP`, then the last `X-Forwarded-For` hop. A public peer cannot supply those headers. Leave `LINES_TRUST_PROXY` off unless the process is reachable only through the proxy.

`POST /v1/jobs` returns **202** `{ "id", "status": "queued" }`. The same idempotency key and body replay that job (header `Idempotency-Replayed: true`) and do not spend another quota slot. A different body with the same key is **409**.

Create body:

```json
{
  "reference": "order-1001",
  "title": "عرض من اكسبرتو",
  "prompt": "منتج جديد",
  "script": { "text": "نص جاهز", "scenes": [{ "text": "مشهد", "seconds": 5 }] },
  "style": "promo",
  "format": "9:16",
  "language": "ar",
  "seconds": 30,
  "voice": "ar-SA-HamedNeural",
  "callbackUrl": "https://example.com/api/app/studio/render-callback",
  "metadata": { "source": "web" }
}
```

Send `prompt` and/or `script`. `format` is `9:16`, `16:9`, or `1:1`. `language` is `ar` or `en`. `seconds` is `15`, `30`, or `60`. `voice` defaults to `ar-SA-HamedNeural` or `en-US-JennyNeural`. `callbackUrl` is https only; loopback, link-local, and private addresses are rejected (**422 `ssrf_blocked`**), including after DNS resolution.

States: `queued` → `running` → `succeeded` | `failed` | `cancelled`.

`GET /v1/quote` returns `{ style, seconds, format, language, voice, engine, currency: "SAR", amount: 0, includedInPlan: true }`. Amount stays 0 until a paid engine is configured. The external engine module is not configured.

Artifact download supports `Range`. A successful job also includes `signedUrl` (HMAC, `LINES_SIGNING_KEY`, default 15 minutes) when that key is set. The signature is not an API key.

## Quotas, leases, retention

- Per-tenant jobs per rolling hour (default 20) and video-seconds per UTC month (default 36000). **429** with `Retry-After`. A cancelled job that never started returns its seconds. The hourly slot stays spent.
- Global renders at once: `LINES_MAX_CONCURRENCY`, default **1** (one Mac mini).
- Lease: `LINES_LEASE_MS`, default 120s, extended by heartbeat. An expired lease goes back to `queued` until `LINES_MAX_ATTEMPTS` (default 2), then `failed` / `lease_expired`.
- Deadline: `LINES_JOB_DEADLINE_MS`, default 2 hours, then `deadline_exceeded`.
- Artifacts: `LINES_ARTIFACT_TTL_MS`, default 14 days. After that, download is **410**.

## Webhooks

On `job.succeeded`, `job.failed`, and `job.cancelled`, if `callbackUrl` was set:

- Body `{ "event", "job" }` where `job` matches `GET /v1/jobs/:id`.
- `X-Lines-Timestamp`: unix seconds.
- `X-Lines-Signature`: `sha256=` + hex HMAC-SHA256 of `timestamp.body` (the timestamp, a dot, and the raw body) using the tenant webhook secret.
- Retries with backoff. Non-2xx and blocked addresses are not followed (redirects are not followed). Polling still works.
- Receivers should reject timestamps older than 5 minutes and compare the signature in constant time. Dedupe on `event` + `job.id`.

## Worker

`POST /v1/worker/claim` returns `{ "job": null }` or `{ "job", "leaseExpiresAt" }`. The job carries the render spec (title, prompt, script, style, format, language, seconds, voice, metadata) and not the callback URL. Workers read render options from `metadata`, so callers must not put secrets there. Heartbeat returns `{ "cancelRequested", "leaseExpiresAt" }`. Artifacts are multipart fields `video` (MP4) and optional `thumbnail` (PNG or JPEG). `complete` requires the video. `fail` body is `{ "code", "message", "retry" }`.

The in-process template worker only claims `engine: "template"`. MoneyPrinter jobs wait for the Mac. See `services/mac-video-worker/README.md`.

`style: "promo3d"` (engine `blender`) is a procedural 3D promo rendered by Blender on the Mac. It is listed only when `LINES_ENABLE_BLENDER=1`, and only a worker key with `--engines blender` can claim it. Optional `metadata`: `hero` (`phone`, `laptop`, `orb`), `heroAsset` (a file name in the worker's assets folder), `palette` (`#bg,#primary,#accent[,#text]`), `brand`, `cta`. See `services/blender-3d-promo/README.md`.

`style: "ugc"` (engine `ugc`) is a selfie-style testimonial: a fixed presenter speaks `script.text` (required) with lip sync. It is listed only when `LINES_ENABLE_UGC=1` and claimed by a worker key with `--engines ugc`. Format `9:16` only, `seconds` 15 or 30, `voice` is always `"presenter"`, `metadata.presenter` picks the presenter. The worker makes paid vendor calls (ElevenLabs, fal.ai); this API still makes none. See `services/ugc-worker/README.md`.

`style: "localize"` (engine `localize`) is ad localization: a Saudi version of an existing video ad. The body carries `localize` instead of `prompt`: `source.url` (public https MP4), up to 30 `swaps` (`kind` `character` | `outfit` | `product` | `background`, with a `preset`, a free-text `target`, or a public https `referenceUrl`), `captions` (`dialect` `najdi` | `hijazi` | `janoubi` | `sharqawi` | `white`, optional `text`), `dub` (needs a dialect), and `consent.likeness`. A character swap or a dub is rejected without `consent.likeness: true`. The source and reference links get the same public-address check as callbacks. The style is listed only when `LINES_ENABLE_LOCALIZE=1`, and only a worker key with `--engines localize` can claim it; the claimed job carries `localize` and a duration-based `cost` estimate. `/v1/quote` for this style also returns `cost` (optional `swaps` and `dub` query params; defaults are 1 swap and dub on). The localize worker (`services/localize-worker`) runs paid calls: Runway Aleph 2.0 (`POST /v1/video_to_video`, model `aleph2`) applies the visual swaps, then HeyGen Video Translation Precision (`POST /v3/video-translations`, `mode: "precision"`, `output_languages: ["Arabic (Saudi Arabia)"]`) dubs and lip-syncs when `dub` is true. This API process still makes none of those calls. Jobs over `LINES_LOCALIZE_MAX_USD` (default 15) fail with `cost_cap_exceeded` before any vendor call. Missing `RUNWAY_API_KEY` / `HEYGEN_API_KEY` fail with `engine_not_configured`. Keep the flag off in production until keys, credit and a deploy are approved. The spec is stored in the nullable `localize_json` column, added on startup to an existing database; back up the data volume before the first deploy that includes it.

## Single instance

The data directory has one writer. The process holds a SQLite reserved lock on `worker.lock` and a heartbeat in `worker.leader.json` (hostname, pid, timestamp). The kernel releases the lock when the process dies, including SIGKILL, so a new container is not blocked by a file that says PID 1 (that pid is alive inside every container). A leftover text lock from the previous build is ignored once it is older than 15 seconds.

Coolify starts the new container, waits until its health check passes, then stops the old one. The new process binds the port immediately and answers **200** on `/v1/health` while it waits, so that wait does not fail the deploy. It writes `worker.handoff`. The running process closes the database, releases the lock, and stops listening, but the process stays up until SIGTERM (`lock_idle`). A restart policy therefore does not boot a second writer. The handoff writes `worker.yielded.json` tied to a boot id stored on the container filesystem (not the shared volume). A process started again in that same container will not take the lock while the successor is still waiting or leading. If the successor is gone for 15 seconds, the idle process opens the database again so a rolled-back deploy does not stay on 503. The image includes `curl` and `wget` because Coolify's probe is `curl -f <url> || wget -q -O- <url> || exit 1`. The Dockerfile `HEALTHCHECK` uses `curl -fsS` against `/v1/health`.

## Keys

```bash
LINES_DATA_DIR=/data node src/keys-cli.js create-app --tenant experto-web
LINES_DATA_DIR=/data node src/keys-cli.js create-worker --id mac-mini --engines moneyprinter
LINES_DATA_DIR=/data node src/keys-cli.js create-worker --id mac-blender --engines blender
LINES_DATA_DIR=/data node src/keys-cli.js create-worker --id ugc-worker --engines ugc
LINES_DATA_DIR=/data node src/keys-cli.js create-worker --id localize-worker --engines localize
LINES_DATA_DIR=/data node src/keys-cli.js rotate-key --id experto-web
LINES_DATA_DIR=/data node src/keys-cli.js rotate-webhook --tenant experto-web
LINES_DATA_DIR=/data node src/keys-cli.js revoke --id experto-web
LINES_DATA_DIR=/data node src/keys-cli.js list
```

`create-app` and `rotate-key` print the new token once. `create-app` prints the webhook secret only when it creates one. `list` prints id, kind, tenant, status, and a short prefix. Stored hashes are not printed.

Or set `LINES_BOOTSTRAP_KEYS` (or `LINES_BOOTSTRAP_KEYS_FILE`, mode `0600`) to a JSON array. Tokens in that JSON are hashed on boot and not logged. Example shape, with placeholders rather than real secrets:

```json
[
  {
    "id": "experto-web",
    "tenantId": "experto-web",
    "kind": "app",
    "token": "REPLACE_WITH_A_RANDOM_TOKEN",
    "webhookSecret": "REPLACE_WITH_A_RANDOM_SECRET",
    "scopes": ["jobs:write", "jobs:read", "jobs:cancel", "artifacts:read", "usage:read"],
    "jobsPerHour": 20,
    "videoSecondsPerMonth": 36000
  },
  {
    "id": "mac-mini",
    "kind": "worker",
    "token": "REPLACE_WITH_A_WORKER_TOKEN",
    "engines": ["moneyprinter"]
  }
]
```

## Environment

Set these on the Coolify app. Do not commit values.

| Name | Role |
|---|---|
| `LINES_DATA_DIR` | Persistent directory. Required. In Docker, `/data`. |
| `LINES_HOST` | Bind address. Docker default `0.0.0.0`. |
| `LINES_PORT` | Default `8080`. |
| `LINES_DEFAULT_ENGINE` | `moneyprinter` (production) or `template` (local demo). Stock styles follow this. |
| `LINES_ENABLE_TEMPLATE` | `1` (default) keeps the ffmpeg title-card engine. `0` hides `style: "template"`. |
| `LINES_ENABLE_BLENDER` | `1` lists `style: "promo3d"` (Blender worker on the Mac). Default off. |
| `LINES_ENABLE_UGC` | `1` lists `style: "ugc"` (paid vendors via the UGC worker). Default off. |
| `LINES_BOOTSTRAP_KEYS` | JSON array above. Secret values. Not logged. |
| `LINES_BOOTSTRAP_KEYS_FILE` | Absolute path to that JSON. Prefer this over the inline variable. |
| `LINES_SIGNING_KEY` | HMAC key for short-lived artifact URLs. |
| `LINES_JOBS_PER_HOUR` | Default quota for a new tenant. Default 20. Hard max 1000. |
| `LINES_VIDEO_SECONDS_PER_MONTH` | Default monthly seconds. Default 36000. |
| `LINES_MAX_CONCURRENCY` | Renders at once. Default 1. Hard max 8. |
| `LINES_JOB_DEADLINE_MS` | Default 2 hours. |
| `LINES_ARTIFACT_TTL_MS` | Default 14 days. |
| `LINES_LEASE_MS` | Worker lease. Default 120000. A moneyprinter worker is `online` for twice this long after a claim or heartbeat. |
| `LINES_TRUST_PROXY` | `1` in Docker. Read `CF-Connecting-IP` / `X-Real-IP` / `X-Forwarded-For` only when the TCP peer is a trusted proxy. |
| `LINES_TRUSTED_PROXIES` | Optional comma-separated IPs or CIDRs. When set, only these peers are trusted (private ranges are not implied). |
| `LINES_MAX_ATTEMPTS` | Default 2. |
| `LINES_WEBHOOK_TIMEOUT_MS` | Default 8000. |
| `LINES_WEBHOOK_MAX_ATTEMPTS` | Default 8. |
| `LINES_WEBHOOK_PORTS` | Comma-separated. Default `443`. |
| `LINES_TEMPLATE_TIMEOUT_MS` | ffmpeg budget for a template job. |
| `LINES_SIGNED_URL_TTL_MS` | Default 15 minutes. |
| `LINES_FFMPEG` / `LINES_FFPROBE` | Binary overrides. |
| `LINES_FONT_ARABIC` / `LINES_FONT_ARABIC_FAMILY` | Template font override. |
| `LINES_FONT_LATIN` / `LINES_FONT_LATIN_FAMILY` | Template font override. |

Pixabay and the LLM key belong in MoneyPrinterTurbo's `config.toml` on the external drive, not in this service.

## Run

```bash
npm test          # from the repo: API tests and the Mac worker unit tests
npm run lint
LINES_DATA_DIR=/tmp/lines-data LINES_ENABLE_TEMPLATE=1 node services/creative-api/src/index.js
```

Docker, from the repo root, context is the service directory so the marketing `.dockerignore` does not apply:

```bash
docker build -t lines-video-api services/creative-api
docker run --rm -p 8080:8080 -v lines-video-data:/data lines-video-api
curl -fsS http://127.0.0.1:8080/v1/health
```

Coolify: new application, Dockerfile `services/creative-api/Dockerfile`, build context `services/creative-api`, port 8080, domain `api.lines.studio`, one instance, volume mounted at `/data`. Do not point the marketing nginx at this process.

Contract file: `docs/video-api.openapi.yaml`. Caller guide: `docs/video-api-integration.md`.

## Not launch-ready

This API is not deployed. A paid or generative vendor is not configured. Publishing ads is out of scope. Do not merge or launch without a QA pass and an explicit decision to point Coolify at this image.
