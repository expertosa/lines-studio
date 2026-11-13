/**
 * Runway Aleph 2.0 video-to-video, using only documented endpoints and fields:
 *   POST https://api.dev.runwayml.com/v1/video_to_video
 *   GET  https://api.dev.runwayml.com/v1/tasks/{id}
 * Auth: Authorization: Bearer <key>, required header X-Runway-Version: 2024-11-06.
 * The official SDK reads RUNWAYML_API_SECRET; this worker reads RUNWAY_API_KEY
 * and falls back to that name. Never log the key.
 *
 * Status values: PENDING, THROTTLED, RUNNING, SUCCEEDED, FAILED, CANCELLED.
 * THROTTLED is queued, not an error. SUCCEEDED carries `output` (temporary URLs).
 * FAILED carries `failure` and `failureCode`. Poll at most once every five seconds.
 */
export const RUNWAY_API_BASE = 'https://api.dev.runwayml.com';
export const RUNWAY_VERSION = '2024-11-06';
export const ALEPH_MODEL = 'aleph2';

function vendorError(message, code, retry) {
  return Object.assign(new Error(message), { code, retry: Boolean(retry) });
}

export function runwayHeaders(apiKey) {
  return {
    authorization: `Bearer ${apiKey}`,
    'x-runway-version': RUNWAY_VERSION,
    'content-type': 'application/json',
    accept: 'application/json',
  };
}

function onRunwayApi(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === new URL(RUNWAY_API_BASE).host;
  } catch {
    return false;
  }
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) {
    const auth = response.status === 401 || response.status === 403;
    throw vendorError(
      `runway ${what} failed (${response.status}): ${text.slice(0, 200)}`,
      auth ? 'vendor_auth' : 'swap_failed',
      response.status === 429 || response.status >= 500,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw vendorError(`runway ${what} returned invalid JSON`, 'swap_failed', true);
  }
}

function requireKey(apiKey) {
  if (!apiKey) throw vendorError('Runway API key is not configured', 'engine_not_configured', false);
}

/**
 * Start one Aleph 2.0 edit and poll until it succeeds or fails.
 * Returns `{ outputUrl, taskId, estimatedCost }` — never a fabricated success.
 */
export async function runAlephSwap({
  apiKey,
  videoUri,
  promptText,
  keyframes,
  fetchImpl,
  sleep,
  signal,
  pollMs = 5000,
  heartbeat,
  deadlineAt,
  now = () => Date.now(),
}) {
  requireKey(apiKey);
  if (!videoUri) throw vendorError('videoUri is required', 'swap_failed', false);
  if (!promptText) throw vendorError('promptText is required', 'swap_failed', false);
  const body = { model: ALEPH_MODEL, videoUri, promptText, outputFormat: 'mp4' };
  if (Array.isArray(keyframes) && keyframes.length) body.keyframes = keyframes;
  const submitted = await json(await fetchImpl(`${RUNWAY_API_BASE}/v1/video_to_video`, {
    method: 'POST',
    headers: runwayHeaders(apiKey),
    body: JSON.stringify(body),
    redirect: 'error',
    signal,
  }), 'submit');
  const taskId = submitted.id;
  if (!taskId) throw vendorError('runway submit returned no task id', 'swap_failed', false);
  const taskUrl = `${RUNWAY_API_BASE}/v1/tasks/${taskId}`;
  for (;;) {
    if (signal?.aborted) throw vendorError('cancelled', 'cancelled', false);
    if (deadlineAt && Date.parse(deadlineAt) <= now()) throw vendorError('job deadline reached', 'render_timeout', false);
    const task = await json(await fetchImpl(taskUrl, {
      headers: runwayHeaders(apiKey),
      redirect: 'error',
      signal,
    }), 'status');
    const status = task.status;
    if (status === 'SUCCEEDED') {
      const outputUrl = Array.isArray(task.output) ? task.output[0] : null;
      if (!outputUrl || !String(outputUrl).startsWith('https://')) {
        throw vendorError('runway task succeeded with no https output URL', 'swap_failed', false);
      }
      return {
        outputUrl,
        taskId,
        estimatedCost: task.estimatedCost || submitted.estimatedCost || null,
      };
    }
    if (status === 'FAILED' || status === 'CANCELLED') {
      throw vendorError(
        `runway task ${String(status).toLowerCase()}: ${String(task.failure || task.failureCode || status).slice(0, 200)}`,
        'swap_failed',
        false,
      );
    }
    if (status !== 'PENDING' && status !== 'THROTTLED' && status !== 'RUNNING') {
      throw vendorError(`runway status ${String(status).slice(0, 40)}`, 'swap_failed', false);
    }
    if (heartbeat) await heartbeat();
    await sleep(pollMs);
  }
}

export async function downloadHttps(url, fetchImpl, signal) {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    if (!String(current).startsWith('https://')) {
      throw vendorError('refusing to download a non-https URL', 'swap_failed', false);
    }
    if (onRunwayApi(current)) {
      throw vendorError('refusing to download from the Runway API host', 'swap_failed', false);
    }
    const response = await fetchImpl(current, { redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400) {
      const next = typeof response.headers?.get === 'function' ? response.headers.get('location') : null;
      if (!next) throw vendorError(`video download redirect missing location (${response.status})`, 'swap_failed', false);
      current = new URL(next, current).href;
      continue;
    }
    if (!response.ok) throw vendorError(`video download failed (${response.status})`, 'swap_failed', false);
    return Buffer.from(await response.arrayBuffer());
  }
  throw vendorError('video download redirected too many times', 'swap_failed', false);
}
