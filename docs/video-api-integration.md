# Calling the Lines video API

The key lives on a server. A browser or a mobile app never sees it and never calls `api.lines.studio` directly. experto-web (and each other app) has its own tenant key. The Experto mobile app calls experto-web; experto-web calls this API.

Two secrets, both issued once by `keys-cli` and stored in the caller's environment, not in the app binary:

- `LINES_API_KEY` — bearer token
- `LINES_WEBHOOK_SECRET` — HMAC secret for `callbackUrl`

`LINES_API_BASE` is the origin, for example `https://api.lines.studio`.

## Next.js server

Create a job from a Route Handler or a server action. `reference` is your order id. Reuse it as `Idempotency-Key` so a double submit does not queue two renders.

```js
export async function queueVideo({ reference, userId, title, prompt }) {
  const response = await fetch(`${process.env.LINES_API_BASE}/v1/jobs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.LINES_API_KEY}`,
      'content-type': 'application/json',
      'idempotency-key': reference,
      'x-end-user-id': userId,
    },
    body: JSON.stringify({
      reference,
      title,
      prompt,
      style: 'promo',
      format: '9:16',
      language: 'ar',
      seconds: 30,
      callbackUrl: 'https://YOUR_PUBLIC_HOST/api/app/studio/render-callback',
    }),
  });
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get('retry-after') || 60);
    throw Object.assign(new Error('quota'), { retryAfter });
  }
  if (response.status !== 202) {
    throw new Error('video api rejected the job');
  }
  const body = await response.json();
  return { jobId: body.id, status: body.status };
}
```

`callbackUrl` must be public https on port 443. Private, loopback, and link-local hosts are rejected.

`subtitles` defaults to false. Set `subtitles: true` only when the video should show captions. `voiceover` defaults to true; `voiceover: false` skips narration.

A showcase clip is a silent vertical move over a screenshot you already host:

```js
body: JSON.stringify({
  reference,
  title,
  style: 'showcase',
  format: '9:16',
  language: 'ar',
  seconds: 8,
  imageUrl: 'https://lines.studio/work/mashhad.webp',
  callbackUrl: 'https://YOUR_PUBLIC_HOST/api/app/studio/render-callback',
}),
```

`seconds` is 6–10. `imageUrl` is `https://lines.studio/work/<id>.webp` (png and jpeg too) or an artifact URL on `https://api.lines.studio`. The clip has no captions, no logo, and no audio. Do not send `subtitles: true` or `voiceover: true` with this style.

Poll `GET /v1/jobs/:id` with the same bearer if you do not want to wait for the webhook. List with `GET /v1/jobs?status=succeeded&cursor=`.

Download with the bearer:

```js
const file = await fetch(`${process.env.LINES_API_BASE}${job.artifacts[0].downloadPath}`, {
  headers: { authorization: `Bearer ${process.env.LINES_API_KEY}` },
});
```

Or hand `signedUrl` to a player. It expires (default 15 minutes) and is not the API key.

### Webhook

Read the raw body before JSON.parse. Compare the signature in constant time and reject timestamps more than five minutes off. Dedupe `event` + `job.id`.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyLinesWebhook(rawBody, headers) {
  const timestamp = headers.get('x-lines-timestamp') || '';
  const signature = headers.get('x-lines-signature') || '';
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = `sha256=${createHmac('sha256', process.env.LINES_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}
```

Events: `job.succeeded`, `job.failed`, `job.cancelled`. The body is `{ event, job }`.

Quote before showing a price: `GET /v1/quote?seconds=30&style=promo`. `amount` is 0 and `includedInPlan` is true until a paid engine exists.

## Mobile

The phone calls your backend, for example `POST /api/app/studio/...` on experto-web, with the user session. The backend performs the request above. Do not ship `LINES_API_KEY` in the app, in Expo config, or in a public client bundle.

A typical flow:

1. The app submits the title, prompt, format, and duration to its backend.
2. The backend queues the job and stores `jobId` on the user's order.
3. The app polls the backend. The backend polls `GET /v1/jobs/:id` or waits for the webhook.
4. The backend returns a short-lived `signedUrl` or proxies the bytes. The phone never sends the Lines bearer.

Arabic product copy uses the spelling «اكسبرتو».
