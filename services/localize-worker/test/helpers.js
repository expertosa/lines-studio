import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function tmp(prefix = 'loc-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function respond(status, body, type = 'application/json', extraHeaders = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const headers = new Map([['content-type', type], ...Object.entries(extraHeaders)]);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers,
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
  };
}

/**
 * Fake Runway + HeyGen HTTP. Records every call. Never talks to the real APIs.
 */
export function fakeVendors({
  mp4 = Buffer.from('fake-mp4'),
  runwayStatuses = ['PENDING', 'RUNNING', 'SUCCEEDED'],
  heygenStatuses = ['pending', 'running', 'completed'],
  runwaySubmitStatus = 200,
  heygenSubmitStatus = 200,
  outputUrl = 'https://dnznrvs05pmza.cloudfront.net/aleph-out.mp4',
  videoUrl = 'https://resource.heygen.ai/video/translated.mp4',
  runwayFailure = 'moderation',
  heygenFailure = 'audio extraction failed',
} = {}) {
  const calls = [];
  let runwayPolls = 0;
  let heygenPolls = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    calls.push({
      host: u.host,
      path: u.pathname,
      method: init.method || 'GET',
      headers,
      body: typeof init.body === 'string' ? init.body : undefined,
    });
    if (u.host === 'api.dev.runwayml.com' && u.pathname === '/v1/video_to_video' && (init.method || 'GET') === 'POST') {
      if (runwaySubmitStatus !== 200) return respond(runwaySubmitStatus, { failure: 'nope' });
      return respond(200, { id: '11111111-1111-1111-1111-111111111111', estimatedCost: { credits: 840 } });
    }
    if (u.host === 'api.dev.runwayml.com' && u.pathname.startsWith('/v1/tasks/')) {
      const status = runwayStatuses[Math.min(runwayPolls, runwayStatuses.length - 1)];
      runwayPolls += 1;
      const body = { id: '11111111-1111-1111-1111-111111111111', status, estimatedCost: { credits: 840 } };
      if (status === 'SUCCEEDED') body.output = [outputUrl];
      if (status === 'FAILED') {
        body.failure = runwayFailure;
        body.failureCode = 'SAFETY.INPUT.TEXT';
      }
      return respond(200, body);
    }
    if (u.host === 'api.heygen.com' && u.pathname === '/v3/video-translations' && (init.method || 'GET') === 'POST') {
      if (heygenSubmitStatus !== 200) return respond(heygenSubmitStatus, { error: { code: 'unauthorized', message: 'Invalid or expired API key.' } });
      return respond(200, { data: { video_translation_ids: ['vt-1'] } });
    }
    if (u.host === 'api.heygen.com' && u.pathname.startsWith('/v3/video-translations/')) {
      const status = heygenStatuses[Math.min(heygenPolls, heygenStatuses.length - 1)];
      heygenPolls += 1;
      const data = { id: 'vt-1', status, output_language: 'Arabic (Saudi Arabia)' };
      if (status === 'completed') {
        data.video_url = videoUrl;
        data.srt_caption_url = 'https://resource.heygen.ai/captions/out.srt';
      }
      if (status === 'failed') data.failure_message = heygenFailure;
      return respond(200, { data });
    }
    if (u.host === 'dnznrvs05pmza.cloudfront.net' || u.host === 'resource.heygen.ai') {
      return respond(200, mp4, 'video/mp4');
    }
    return respond(404, { error: 'unexpected host' });
  };
  return { fetchImpl, calls };
}

export function fakeClient() {
  const calls = [];
  return {
    calls,
    heartbeat: async (id) => { calls.push(['heartbeat', id]); return { cancelRequested: false }; },
    upload: async (id, video, thumb) => {
      calls.push(['upload', id, fs.statSync(video).size, thumb ? fs.statSync(thumb).size : 0]);
    },
    complete: async (id) => { calls.push(['complete', id]); },
    fail: async (id, body) => { calls.push(['fail', id, body]); },
  };
}

export function localizeJob(extra = {}, spec = {}) {
  return {
    id: 'job-loc-1',
    engine: 'localize',
    title: 'إعلان القهوة بنسخة سعودية',
    seconds: 30,
    deadlineAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    localize: {
      source: { url: 'https://cdn.example.com/ads/coffee-global.mp4' },
      swaps: [
        { kind: 'character', preset: 'saudi-man' },
        { kind: 'outfit', preset: 'thobe-shemagh' },
        { kind: 'product', target: 'علبة قهوة سعودية', referenceUrl: 'https://cdn.example.com/products/qahwa.png' },
        { kind: 'background', preset: 'riyadh-boulevard' },
      ],
      captions: { dialect: 'najdi', text: 'صباحك أحلى مع قهوتنا' },
      dub: true,
      consent: { likeness: true },
      ...spec,
    },
    ...extra,
  };
}
