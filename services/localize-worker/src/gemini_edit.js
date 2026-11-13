/**
 * Economy-tier visual swaps with Gemini Omni 1.2 Flash video edit, using only the
 * documented Google Cloud endpoints:
 *   POST https://storage.googleapis.com/upload/storage/v1/b/{bucket}/o?uploadType=media&name={object}
 *   POST https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions
 *   GET  https://aiplatform.googleapis.com/v1beta1/projects/{project}/locations/global/interactions/{id}
 * Request: model `gemini-omni-1.2-flash`, `background: true`, input = text prompt + `gs://` video,
 * `response_format: [{ type: 'video', delivery: 'inline', resolution: '720p' }]`,
 * `generation_config.video_config.task = 'edit'`. The finished interaction carries the MP4 as
 * base64 in `steps[].content[].data` (type `video`). Input clips must be 3–15 s; the output
 * matches the input length. $0.07 per output second at 720p.
 * Auth is a Google OAuth access token (Bearer) with Vertex AI + Storage access; the operator
 * refreshes it (for example `gcloud auth print-access-token`). Never log it.
 */
export const VERTEX_BASE = 'https://aiplatform.googleapis.com';
export const GCS_UPLOAD_BASE = 'https://storage.googleapis.com';
export const GEMINI_EDIT_MODEL = 'gemini-omni-1.2-flash';

function vendorError(message, code, retry) {
  return Object.assign(new Error(message), { code, retry: Boolean(retry) });
}

export function geminiConfig(env = process.env, readToken = () => '') {
  return {
    project: env.GEMINI_VERTEX_PROJECT || '',
    bucket: env.GEMINI_GCS_BUCKET || '',
    token: env.GOOGLE_OAUTH_ACCESS_TOKEN || readToken() || '',
  };
}

export function assertGeminiReady(config) {
  const missing = ['project', 'bucket', 'token'].filter((k) => !config[k]);
  if (missing.length) {
    throw vendorError(`Gemini video edit is not configured (missing ${missing.join(', ')})`, 'engine_not_configured', false);
  }
}

async function readJson(response, what) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw vendorError(`${what} returned non-JSON (${response.status})`, 'swap_failed', false);
  }
}

function authError(status) {
  return status === 401 || status === 403;
}

export async function uploadToGcs({ config, objectName, bytes, mime = 'video/mp4', fetchImpl, signal }) {
  const url = `${GCS_UPLOAD_BASE}/upload/storage/v1/b/${encodeURIComponent(config.bucket)}/o?uploadType=media&name=${encodeURIComponent(objectName)}`;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${config.token}`, 'content-type': mime },
    body: bytes,
    redirect: 'error',
    signal,
  });
  if (!response.ok) {
    throw vendorError(`cloud storage upload failed (${response.status})`, authError(response.status) ? 'vendor_auth' : 'swap_failed', response.status >= 500);
  }
  return `gs://${config.bucket}/${objectName}`;
}

export function editRequestBody({ prompt, gcsUri, images = [] }) {
  return {
    model: GEMINI_EDIT_MODEL,
    background: true,
    input: [
      { type: 'text', text: prompt },
      { type: 'video', uri: gcsUri, mime_type: 'video/mp4' },
      // Up to two optional reference images (documented for gemini-omni-1.2-flash).
      ...images.slice(0, 2).map((img) => ({ type: 'image', uri: img.uri, mime_type: img.mime })),
    ],
    response_format: [{ type: 'video', delivery: 'inline', resolution: '720p' }],
    generation_config: { video_config: { task: 'edit' } },
  };
}

function videoFrom(interaction) {
  for (const step of interaction.steps || []) {
    if (step.type !== 'model_output') continue;
    for (const part of step.content || []) {
      if (part.type === 'video' && part.data) return Buffer.from(part.data, 'base64');
    }
  }
  return null;
}

export async function runGeminiEdit({ config, prompt, gcsUri, images = [], fetchImpl, sleep, signal, pollMs = 10_000, heartbeat, deadlineAt, now = () => Date.now() }) {
  const base = `${VERTEX_BASE}/v1beta1/projects/${encodeURIComponent(config.project)}/locations/global/interactions`;
  const headers = { authorization: `Bearer ${config.token}`, 'content-type': 'application/json; charset=utf-8' };
  const submit = await fetchImpl(base, { method: 'POST', headers, body: JSON.stringify(editRequestBody({ prompt, gcsUri, images })), redirect: 'error', signal });
  const created = await readJson(submit, 'gemini submit');
  if (!submit.ok) {
    throw vendorError(`gemini edit submit failed (${submit.status})`, authError(submit.status) ? 'vendor_auth' : 'swap_failed', submit.status === 429 || submit.status >= 500);
  }
  if (!created.id) throw vendorError('gemini edit returned no interaction id', 'swap_failed', false);
  const deadline = deadlineAt ? Date.parse(deadlineAt) : Infinity;
  let interaction = created;
  for (;;) {
    if (interaction.status === 'completed') {
      const bytes = videoFrom(interaction);
      if (!bytes?.length) throw vendorError('gemini edit completed without a video', 'swap_failed', false);
      return { bytes, interactionId: created.id };
    }
    // Documented values: in_progress, completed. Anything else (failed, cancelled, …) stops the job.
    if (interaction.status !== 'in_progress') {
      throw vendorError(`gemini edit status ${String(interaction.status).slice(0, 40)}`, 'swap_failed', false);
    }
    if (now() > deadline) throw vendorError('gemini edit did not finish before the job deadline', 'render_timeout', false);
    if (heartbeat) await heartbeat();
    await sleep(pollMs);
    const poll = await fetchImpl(`${base}/${encodeURIComponent(created.id)}`, { method: 'GET', headers, redirect: 'error', signal });
    interaction = await readJson(poll, 'gemini poll');
    if (!poll.ok) throw vendorError(`gemini edit poll failed (${poll.status})`, authError(poll.status) ? 'vendor_auth' : 'swap_failed', poll.status >= 500);
  }
}
