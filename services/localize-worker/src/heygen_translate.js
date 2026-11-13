/**
 * HeyGen Video Translation (Precision, with lip-sync), documented endpoints only:
 *   POST https://api.heygen.com/v3/video-translations
 *   GET  https://api.heygen.com/v3/video-translations/{video_translation_id}
 * Auth: x-api-key. Language values are names, not ISO codes.
 * Documented Saudi Arabic target: "Arabic (Saudi Arabia)".
 * mode: "precision" re-renders the mouth to match the translated audio.
 * Do not set translate_audio_only: that skips lip-sync.
 * Poll while status is pending or running. completed → data.video_url;
 * failed → data.failure_message. Poll every 30–60 seconds in production.
 */
export const HEYGEN_API_BASE = 'https://api.heygen.com';
export const HEYGEN_SAUDI_LANGUAGE = 'Arabic (Saudi Arabia)';
export const HEYGEN_MODE = 'precision';

function vendorError(message, code, retry) {
  return Object.assign(new Error(message), { code, retry: Boolean(retry) });
}

export function heygenHeaders(apiKey) {
  return {
    'x-api-key': apiKey,
    accept: 'application/json',
    'content-type': 'application/json',
  };
}

function onHeygenApi(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.host === new URL(HEYGEN_API_BASE).host;
  } catch {
    return false;
  }
}

async function json(response, what) {
  const text = await response.text();
  if (!response.ok) {
    const auth = response.status === 401 || response.status === 403;
    throw vendorError(
      `heygen ${what} failed (${response.status}): ${text.slice(0, 200)}`,
      auth ? 'vendor_auth' : 'translate_failed',
      response.status === 429 || response.status >= 500,
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw vendorError(`heygen ${what} returned invalid JSON`, 'translate_failed', true);
  }
}

function requireKey(apiKey) {
  if (!apiKey) throw vendorError('HeyGen API key is not configured', 'engine_not_configured', false);
}

function translationIdFrom(body) {
  const ids = body?.data?.video_translation_ids || body?.video_translation_ids;
  if (Array.isArray(ids) && ids[0]) return ids[0];
  return null;
}

/**
 * Translate a public video URL into Arabic (Saudi Arabia) in precision mode
 * and poll until `video_url` is available. Returns `{ videoUrl, translationId, captions }`.
 */
export async function runHeygenPrecision({
  apiKey,
  videoUrl,
  title,
  outputLanguage = HEYGEN_SAUDI_LANGUAGE,
  fetchImpl,
  sleep,
  signal,
  pollMs = 30_000,
  heartbeat,
  deadlineAt,
  now = () => Date.now(),
}) {
  requireKey(apiKey);
  if (!videoUrl || !String(videoUrl).startsWith('https://')) {
    throw vendorError('a public https video URL is required', 'translate_failed', false);
  }
  const submitted = await json(await fetchImpl(`${HEYGEN_API_BASE}/v3/video-translations`, {
    method: 'POST',
    headers: heygenHeaders(apiKey),
    body: JSON.stringify({
      video: { type: 'url', url: videoUrl },
      output_languages: [outputLanguage],
      mode: HEYGEN_MODE,
      title: title || 'Saudi ad localization',
      keep_the_same_format: true,
      enable_dynamic_duration: false,
    }),
    redirect: 'error',
    signal,
  }), 'submit');
  const translationId = translationIdFrom(submitted);
  if (!translationId) throw vendorError('heygen submit returned no video_translation_ids', 'translate_failed', false);
  const statusUrl = `${HEYGEN_API_BASE}/v3/video-translations/${translationId}`;
  for (;;) {
    if (signal?.aborted) throw vendorError('cancelled', 'cancelled', false);
    if (deadlineAt && Date.parse(deadlineAt) <= now()) throw vendorError('job deadline reached', 'render_timeout', false);
    const body = await json(await fetchImpl(statusUrl, {
      headers: heygenHeaders(apiKey),
      redirect: 'error',
      signal,
    }), 'status');
    const data = body.data || body;
    const status = data.status;
    if (status === 'completed') {
      const out = data.video_url;
      if (!out || !String(out).startsWith('https://')) {
        throw vendorError('heygen completed with no https video_url', 'translate_failed', false);
      }
      return {
        videoUrl: out,
        translationId,
        captions: {
          srt: data.srt_caption_url || null,
          vtt: data.vtt_caption_url || null,
        },
      };
    }
    if (status === 'failed') {
      throw vendorError(
        `heygen translation failed: ${String(data.failure_message || 'failed').slice(0, 200)}`,
        'translate_failed',
        false,
      );
    }
    if (status !== 'pending' && status !== 'running') {
      throw vendorError(`heygen status ${String(status).slice(0, 40)}`, 'translate_failed', false);
    }
    if (heartbeat) await heartbeat();
    await sleep(pollMs);
  }
}

export async function downloadHttps(url, fetchImpl, signal) {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    if (!String(current).startsWith('https://')) {
      throw vendorError('refusing to download a non-https URL', 'translate_failed', false);
    }
    if (onHeygenApi(current)) {
      throw vendorError('refusing to download from the HeyGen API host', 'translate_failed', false);
    }
    const response = await fetchImpl(current, { redirect: 'manual', signal });
    if (response.status >= 300 && response.status < 400) {
      const next = typeof response.headers?.get === 'function' ? response.headers.get('location') : null;
      if (!next) throw vendorError(`video download redirect missing location (${response.status})`, 'translate_failed', false);
      current = new URL(next, current).href;
      continue;
    }
    if (!response.ok) throw vendorError(`video download failed (${response.status})`, 'translate_failed', false);
    return Buffer.from(await response.arrayBuffer());
  }
  throw vendorError('video download redirected too many times', 'translate_failed', false);
}
