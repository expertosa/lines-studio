// Same worker protocol as services/mac-video-worker/src/api.js (kept separate so each worker deploys on its own).
import fs from 'node:fs';

function encodePart(boundary, name, type, filename, data) {
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"; filename="${filename}"\r\nContent-Type: ${type}\r\n\r\n`,
    ),
    data,
    Buffer.from('\r\n'),
  ]);
}

export function createClient({ baseUrl, token, fetchImpl }) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  async function request(method, pathname, { json, body, headers } = {}) {
    const response = await fetchImpl(`${root}${pathname}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(json ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: json ? JSON.stringify(json) : body,
      redirect: 'manual',
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (response.status < 200 || response.status >= 300) {
      const error = new Error(parsed?.error?.message || `HTTP ${response.status}`);
      error.status = response.status;
      error.code = parsed?.error?.code;
      throw error;
    }
    return parsed;
  }
  return {
    claim() {
      return request('POST', '/v1/worker/claim', { json: {} });
    },
    heartbeat(id) {
      return request('POST', `/v1/worker/jobs/${id}/heartbeat`, { json: {} });
    },
    complete(id) {
      return request('POST', `/v1/worker/jobs/${id}/complete`, { json: {} });
    },
    fail(id, payload) {
      return request('POST', `/v1/worker/jobs/${id}/fail`, { json: payload });
    },
    async upload(id, videoPath, thumbnailPath) {
      const boundary = `lines${Date.now().toString(16)}`;
      const chunks = [
        encodePart(boundary, 'video', 'video/mp4', 'video.mp4', fs.readFileSync(videoPath)),
      ];
      if (thumbnailPath) {
        chunks.push(encodePart(boundary, 'thumbnail', 'image/jpeg', 'thumb.jpg', fs.readFileSync(thumbnailPath)));
      }
      chunks.push(Buffer.from(`--${boundary}--\r\n`));
      return request('POST', `/v1/worker/jobs/${id}/artifacts`, {
        body: Buffer.concat(chunks),
        headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      });
    },
  };
}

export function sanitizeMessage(message) {
  return String(message || 'render failed').replace(/https?:\/\/\S+/gi, '[url]').slice(0, 300);
}
