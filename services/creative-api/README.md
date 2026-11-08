# Lines Studio creative jobs API

Server-to-server API for preparing a video or a still ad creative. The public marketing site stays a static Next.js export behind nginx. This process is separate: experto-web calls it, then the Experto app talks only to experto-web.

It does not publish ads, does not call a paid or generative model, and does not accept a fixture file as a finished order.

## Who calls it

1. experto-web holds the bearer credential (`LINES_CREATIVE_CREDENTIALS` or `LINES_CREATIVE_CREDENTIALS_FILE`).
2. experto-web sends the tenant and customer that own the job.
3. The mobile app never sees this credential and never calls a media provider directly.

There is no browser CORS header. Identity in the query string is rejected.

## Auth

| Header | Required | Rule |
|---|---|---|
| `Authorization` | yes, except `GET /v1/health` | `Bearer` plus a 24–256 character token from the credential file. Alphabet: `A-Za-z0-9._~+/-` and trailing `=`. |
| `X-Tenant-Id` | yes | 1–64 of `A-Za-z0-9_-`. The credential must list that tenant or `*`. |
| `X-Customer-Id` | yes | Same shape. Stored as the owner of the job. |
| `Idempotency-Key` | POST create only | 8–128 of `A-Za-z0-9._:-`. |
| `Content-Type` | POST with a body | `application/json` or `application/json; charset=utf-8`. |

A credential is a JSON array:

```json
[{
  "id": "experto-web",
  "token": "CHANGE_ME_TO_A_LONG_RANDOM_TOKEN",
  "tenants": ["*"],
  "scopes": ["jobs:write", "jobs:read", "jobs:cancel", "artifacts:read"]
}]
```

`CHANGE_ME_TO_A_LONG_RANDOM_TOKEN` is only a shape example. The boot path rejects tokens shorter than 24 characters. Scopes are not implied by each other. A token limited to tenant A receives **403** if it sends tenant B, and **404** if it sends tenant B's job id with tenant B's own header (the job is not in that tenant). Another customer in the same tenant also gets **404**. Missing jobs and unowned jobs use the same 404 body.

## Endpoints

### `GET /v1/health`

No auth. `ok: true` means the process is up. `ready: true` means the local ffmpeg binary answered. It does **not** mean a paid network, an ad account, or a generative model is configured.

```json
{
  "ok": true,
  "ready": true,
  "service": "lines-creative-api",
  "provider": "local-ffmpeg",
  "generative": false,
  "paidCalls": false,
  "publishSupported": false,
  "fixtureFulfillment": false,
  "capabilities": ["template-video", "template-still"]
}
```

`capabilities` is empty when the engine is not ready.

### `POST /v1/creative-jobs`

Creates a queued job, or replays one.

Video body:

```json
{
  "kind": "video",
  "locale": "ar",
  "headline": "إعلان افتتاح الفرع",
  "subline": "احجز معاينة مجانية",
  "callToAction": "تواصل معنا",
  "brandName": "خطوط ستوديو",
  "width": 1080,
  "height": 1920,
  "durationMs": 5000,
  "backgroundColor": "#102A43",
  "foregroundColor": "#F7F3EA"
}
```

Still ad creative: `"kind": "ad_creative"` and omit `durationMs`. Unknown fields are rejected. These fields are rejected with **422 `publish_not_supported`** because this service does not publish: `publish`, `publishAt`, `published`, `adAccountId`, `accountId`, `accessToken`, `refreshToken`, `oauth`, `oauthToken`, `campaign`, `campaignId`, `adsetId`, `adId`, `pageId`, `platform`, `destinationUrl`, `mediaUrl`, `imageUrl`, `videoUrl`, `sourceUrl`, `callbackUrl`, `webhookUrl`, `externalUrl`, `clickUrl`, `landingUrl`, `budget`, `spend`, `dailyBudget`.

Validation:

- `locale`: `ar` or `en`.
- Text lengths in Unicode code points: headline 1–80, subline 0–120, call to action 0–40, brand 1–40. Letters, numbers, and simple punctuation only. URLs, slashes, backslashes, colons, and bidi overrides are rejected (`url_rejected` or `bad_charset`).
- Size presets: `1080x1920`, `1920x1080`, `1080x1080`, `720x1280`, `1280x720`, `640x360` (preview). Both dimensions must match a preset.
- `durationMs`: integer 2000–10000 for video.
- Colors: `#RRGGBB`. Contrast ratio must be at least 3.
- Body max 8192 bytes.

Responses:

| Status | When |
|---|---|
| 201 | New job. `Location: /v1/creative-jobs/{id}` (relative, not taken from the Host header). |
| 200 | Same tenant, customer, key, and canonical body. Header `Idempotency-Replayed: true`. Does not spend another hourly slot. |
| 409 `idempotency_conflict` | Same key, different body. |
| 422 `validation_error` | Field list in `error.details[].path` and `.code`. |
| 422 `publish_not_supported` | Publish or remote-media fields. The response does not echo secrets. |
| 429 `rate_limited` | More than the hourly cap for that tenant+customer. `Retry-After: 60`. Default and hard cap: 20 jobs per hour. |
| 503 `provider_unavailable` | `LINES_CREATIVE_PROVIDER=disabled`, or ffmpeg/ffprobe is missing. No row is written. `Retry-After: 30`. |
| 400 | Bad JSON, missing idempotency key, bad tenant/customer. |
| 401 / 403 / 413 / 415 | Auth, scope, body size, content type. |

A failed or in-flight job is what a replay returns. To try again, send a new idempotency key.

### `GET /v1/creative-jobs/{id}`

Scope `jobs:read`. **404** when the id is unknown or owned by another tenant/customer.

### `GET /v1/creative-jobs?status=&limit=&cursor=`

Scope `jobs:read`. Only the header tenant and customer. `status` is `queued`, `running`, `succeeded`, `failed`, or `cancelled`. `limit` is 1–50, default 20. `nextCursor` is opaque; pass it back as `cursor`. Invalid cursor is **422**.

### `POST /v1/creative-jobs/{id}/cancel`

Scope `jobs:cancel`. Empty body, or `{}`.

| Status | When |
|---|---|
| 200 | Queued job becomes `cancelled`. A second cancel of a cancelled job returns the same job. A running job is marked cancel-requested and the worker stops the encoder; poll until `cancelled`. |
| 404 | Not owned. |
| 409 `not_cancellable` | Already `succeeded` or `failed`. |

No artifact is stored for a cancel.

### `GET /v1/creative-jobs/{id}/artifacts/{artifactId}`

Scope `artifacts:read`. Bytes of a stored render. Query parameters such as `url` are ignored and are not fetched.

| Header | Value |
|---|---|
| `Content-Type` | `video/mp4` or `image/png` from the file we wrote, not from the caller |
| `Content-Length` | byte size |
| `X-Content-SHA256` | hex sha256 of those bytes |
| `ETag` | quoted sha256 |
| `X-Artifact-Classification` | `rendered` |
| `Content-Disposition` | `attachment; filename="creative-{uuid}.mp4"` or `.png` |
| `X-Content-Type-Options` | `nosniff` |
| `Cache-Control` | `private, no-store` |

**410 `expired`** after `expiresAt`. The file is deleted. The job can stay `succeeded` with an empty `artifacts` array. **404** for a missing, unowned, or non-rendered row. Paths that are not two UUIDs do not match this route.

## Job body

```json
{
  "id": "uuid",
  "tenantId": "tenant-a",
  "customerId": "cust-a",
  "kind": "video",
  "status": "succeeded",
  "brief": {},
  "provider": "local-ffmpeg",
  "generative": false,
  "paidCalls": false,
  "attempt": 1,
  "maxAttempts": 2,
  "createdAt": "2026-11-09T00:00:00.000Z",
  "updatedAt": "2026-11-09T00:00:00.000Z",
  "startedAt": "2026-11-09T00:00:00.000Z",
  "finishedAt": "2026-11-09T00:00:00.000Z",
  "deadlineAt": "2026-11-09T00:03:00.000Z",
  "heartbeatAt": "2026-11-09T00:00:00.000Z",
  "error": null,
  "billing": {
    "payer": "experto",
    "includedInServicePrice": true,
    "extraGenerationFee": false,
    "creditDeduction": false,
    "paidProviderRequest": false
  },
  "publish": {
    "performed": false,
    "supported": false,
    "requiresAdminReview": true,
    "accountSource": "client-owned-via-gateway"
  },
  "artifacts": [
    {
      "id": "uuid",
      "classification": "rendered",
      "role": "master",
      "mime": "video/mp4",
      "byteSize": 12000,
      "sha256": "hex",
      "width": 640,
      "height": 360,
      "durationMs": 2000,
      "expiresAt": "2026-11-16T00:00:00.000Z",
      "lumaStdev": 21.4,
      "uniformFrame": false,
      "downloadPath": "/v1/creative-jobs/{jobId}/artifacts/{artifactId}"
    }
  ]
}
```

`error` is `{ "code", "message" }` or `null`. Disk paths are never returned.

`classification` on a stored artifact is only `rendered`. The database check constraint rejects any other value, including a fixture. A frame whose luma standard deviation is below 8 (a black or flat test picture) fails the job with `artifact_rejected` and stores nothing.

## Status, errors, idempotency, recovery

Statuses: `queued`, `running`, `succeeded`, `failed`, `cancelled`.

| `error.code` | Meaning |
|---|---|
| `deadline_exceeded` | Still queued when `deadlineAt` passed (default 3 minutes, hard max 10). |
| `render_timeout` | Encoder exceeded the job timeout (video: `durationMs * 4 + 8s`, still: 15s, hard max 45s). |
| `render_failed` | Encoder exited non-zero. The client message is generic. |
| `font_unavailable` | Arabic or Latin font file is not installed. |
| `artifact_rejected` | Magic bytes, codec, dimensions, duration, size, audio, path, or flat-frame check failed. |
| `provider_unavailable` | Provider disabled or not ready. Also the HTTP 503 code. |
| `worker_lost` | Process died after the last allowed attempt. |
| `cancelled` | Caller cancelled, or the worker stopped an in-flight render. |

HTTP error body: `{ "error": { "code", "message", "details"? } }`.

Idempotency is stored with the job in SQLite (`creative.sqlite` under `LINES_CREATIVE_DATA_DIR`, WAL, fsync). One OS lock file (`worker.lock`) so a second process does not render the same queue. On boot, rows left `running` by a dead process are requeued when `attempt < maxAttempts` (2). At the last attempt they become `worker_lost`. A graceful shutdown puts the in-flight job back to `queued` and undoes that attempt so a deploy restart does not burn it. Heartbeats update during a render. Cancel of a running job aborts ffmpeg. Partial files under `tmp/` are removed. Only a probe-passed file is renamed into `artifacts/{jobId}/{artifactId}.mp4|png` and inserted in the same success transaction. Orphan files with no row are deleted on boot.

Default artifact TTL is 7 days. Hard max is 30 days (`LINES_CREATIVE_ARTIFACT_TTL_MS`). Global renders default to 1 at a time (hard max 2). One running job per tenant.

## What the renderer actually is

`local-ffmpeg` draws the brief onto a solid background with libass (Arabic shaping when a Noto Naskh Arabic font is present, DejaVu Sans for Latin) and encodes H.264 yuv420p or a PNG. It is a real media file of the requested size and duration. It is not a generative video model, not a stock clip, and not a stand-in black video.

No code path calls `fetch` or an HTTP client. `LINES_CREATIVE_PROVIDER` may be `local-ffmpeg` (default) or `disabled`. Any other name, including a paid vendor, refuses to boot. Child processes do not inherit the credential environment.

Generation is billed inside the Experto service price: `billing.paidProviderRequest` is false and this API has no credit ledger. Publishing to the client's own ad account, after admin review, belongs to experto-web. This service has no OAuth and no publish route.

## Run

```bash
npm test                 # from the repo: auth, IDOR, idempotency, concurrency, restart, validation, artifacts
npm run lint
node services/creative-api/src/index.js
```

The API image is `services/creative-api/Dockerfile` (ffmpeg, Noto Naskh Arabic, DejaVu, port 8080, volume `/data`). It is not part of the marketing `Dockerfile`. Do not point the public nginx site at this process for browsers.

Persistent `LINES_CREATIVE_DATA_DIR` is required. Without it, a new container disk loses jobs and files. The credential file should be mode `0600`; a looser mode logs `credentials_file_perms` and does not print the secret.

## Not launch-ready

- Coolify still serves only the static site. This API is not deployed.
- experto-web and the app are separate workstreams and are not wired here.
- A generative or paid video vendor is not configured. Turning one on would be a new explicit change; the default cannot make that call.
- Live ad publish is intentionally absent.
- No production migration is included; the sqlite file is created on first boot of this service.
