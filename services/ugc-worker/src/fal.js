/**
 * OmniHuman 1.5 on fal.ai through the queue API:
 *   POST https://queue.fal.run/<model>  (Authorization: Key <FAL_KEY>)  -> { request_id, status_url, response_url }
 *   GET  status_url   -> { status: IN_QUEUE | IN_PROGRESS | COMPLETED, ... }
 *   GET  response_url -> { video: { url } }
 * Inputs are image_url and audio_url; base64 data URIs are sent so nothing
 * has to be hosted publicly. The key is only ever sent to queue.fal.run, and
 * the result is only downloaded from fal's media hosts.
 */
export const FAL_QUEUE = 'https://queue.fal.run';
export const OMNIHUMAN_MODEL = 'fal-ai/bytedance/omnihuman/v1.5';
const MEDIA_HOST_RE = /(^|\.)fal\.(media|run|ai)$/;

function vendorError(message, code, retry) {
  return Object.assign(new Error(message), { code, retry });
}

function onQueueHost(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === new URL(FAL_QUEUE).host;
  } catch {
    return false;
  }
}

export function isFalMedia(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && MEDIA_HOST_RE.test(parsed.hostname);
  } catch {
    return false;
  }
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) {
    throw vendorError(`fal ${what} failed (${response.status}): ${text.slice(0, 200)}`,
      response.status === 401 || response.status === 403 ? 'vendor_auth' : 'lipsync_failed',
      response.status === 429 || response.status >= 500);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw vendorError(`fal ${what} returned invalid JSON`, 'lipsync_failed', true);
  }
}

export async function runOmnihuman({
  apiKey,
  imageUrl,
  audioUrl,
  prompt,
  resolution = '1080p',
  model = OMNIHUMAN_MODEL,
  fetchImpl,
  sleep,
  signal,
  pollMs = 5000,
  heartbeat,
  deadlineAt,
  now = () => Date.now(),
}) {
  if (!apiKey) throw vendorError('fal key is not configured', 'vendor_not_configured', false);
  const auth = { authorization: `Key ${apiKey}` };
  const input = { image_url: imageUrl, audio_url: audioUrl, resolution };
  if (prompt) input.prompt = prompt;
  const submitted = await json(await fetchImpl(`${FAL_QUEUE}/${model}`, {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify(input),
    redirect: 'error',
    signal,
  }), 'submit');
  const statusUrl = submitted.status_url || `${FAL_QUEUE}/${model}/requests/${submitted.request_id}/status`;
  const responseUrl = submitted.response_url || `${FAL_QUEUE}/${model}/requests/${submitted.request_id}`;
  if (!onQueueHost(statusUrl) || !onQueueHost(responseUrl)) {
    throw vendorError('fal returned a status URL off queue.fal.run', 'lipsync_failed', false);
  }
  for (;;) {
    if (signal?.aborted) throw vendorError('cancelled', 'cancelled', false);
    if (deadlineAt && Date.parse(deadlineAt) <= now()) throw vendorError('job deadline reached', 'render_timeout', false);
    const status = await json(await fetchImpl(statusUrl, { headers: auth, redirect: 'error', signal }), 'status');
    if (status.status === 'COMPLETED') break;
    if (status.status !== 'IN_QUEUE' && status.status !== 'IN_PROGRESS') {
      throw vendorError(`fal status ${String(status.status).slice(0, 40)}`, 'lipsync_failed', false);
    }
    if (heartbeat) await heartbeat();
    await sleep(pollMs);
  }
  const result = await json(await fetchImpl(responseUrl, { headers: auth, redirect: 'error', signal }), 'result');
  const videoUrl = result?.video?.url;
  if (!isFalMedia(videoUrl)) throw vendorError('fal result has no video on a fal media host', 'lipsync_failed', false);
  return videoUrl;
}

export async function download(url, fetchImpl, signal) {
  if (!isFalMedia(url)) throw vendorError('refusing to download from a non-fal host', 'lipsync_failed', false);
  const response = await fetchImpl(url, { redirect: 'error', signal });
  // Not retried: the lip sync is already paid for; a retry would generate (and charge) it again.
  if (!response.ok) throw vendorError(`video download failed (${response.status})`, 'lipsync_failed', false);
  return Buffer.from(await response.arrayBuffer());
}

export function dataUri(mime, bytes) {
  return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
}
