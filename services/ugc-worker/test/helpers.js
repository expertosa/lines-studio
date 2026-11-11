import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

export function tmp(prefix = 'ugc-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Real media made by ffmpeg so the pipeline runs end to end without vendors. */
export function makeMedia(dir, seconds = 4) {
  const mp3 = path.join(dir, 'tone.mp3');
  const mp4 = path.join(dir, 'talk.mp4');
  const png = path.join(dir, 'face.png');
  const run = (args) => spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  run(['-f', 'lavfi', '-i', `sine=f=220:d=${seconds}`, '-c:a', 'libmp3lame', '-b:a', '64k', mp3]);
  run(['-f', 'lavfi', '-i', `testsrc2=s=576x1024:r=25:d=${seconds}`, '-f', 'lavfi', '-i', `sine=f=330:d=${seconds}`,
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', mp4]);
  run(['-f', 'lavfi', '-i', 'color=c=0x886644:s=576x1024', '-frames:v', '1', png]);
  return { mp3: fs.readFileSync(mp3), mp4: fs.readFileSync(mp4), png };
}

function respond(status, body, type = 'application/json') {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Map([['content-type', type]]),
    text: async () => buf.toString('utf8'),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length),
  };
}

/** Fake ElevenLabs + fal.ai. Records every call (without bodies' base64 payloads). */
export function fakeVendors({ mp3, mp4, statuses = ['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'], ttsStatus = 200, videoUrl } = {}) {
  const calls = [];
  let polls = 0;
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    const headers = init.headers || {};
    calls.push({ host: u.host, path: u.pathname, method: init.method || 'GET', headers, body: init.body });
    if (u.host === 'api.elevenlabs.io') return ttsStatus === 200 ? respond(200, mp3, 'audio/mpeg') : respond(ttsStatus, { detail: 'nope' });
    if (u.host === 'queue.fal.run' && init.method === 'POST') {
      return respond(200, {
        request_id: 'req-1',
        status_url: 'https://queue.fal.run/fal-ai/bytedance/omnihuman/v1.5/requests/req-1/status',
        response_url: 'https://queue.fal.run/fal-ai/bytedance/omnihuman/v1.5/requests/req-1',
      });
    }
    if (u.host === 'queue.fal.run' && u.pathname.endsWith('/status')) {
      const status = statuses[Math.min(polls, statuses.length - 1)];
      polls += 1;
      return respond(200, { status });
    }
    if (u.host === 'queue.fal.run') return respond(200, { video: { url: videoUrl || 'https://v3.fal.media/files/abc/out.mp4' } });
    if (u.host.endsWith('fal.media')) return respond(200, mp4, 'video/mp4');
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
