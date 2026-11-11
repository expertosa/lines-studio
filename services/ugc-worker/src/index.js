import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, sanitizeMessage } from './api.js';
import { assertOnDataVolume, isInside } from './paths.js';
import { loadPresenters } from './presenters.js';
import { renderClaimedJob } from './run.js';

/** Secrets are one-line files under <root>/secrets (mode 0600), never env values in a plist. */
function readSecret(root, file) {
  const target = assertOnDataVolume(file);
  if (!isInside(root, target)) throw new Error(`${file} must be inside LINES_WORKER_ROOT`);
  const stat = fs.statSync(target);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${path.basename(target)} must be mode 0600`);
  return fs.readFileSync(target, 'utf8').trim();
}

export async function main({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const root = assertOnDataVolume(process.env.LINES_WORKER_ROOT || '');
  const home = path.join(root, 'ugc');
  const tmpDir = path.join(home, 'tmp');
  for (const dir of [tmpDir, path.join(home, 'logs')]) fs.mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = tmpDir;
  const secrets = path.join(root, 'secrets');
  const presentersDir = assertOnDataVolume(process.env.UGC_PRESENTERS_DIR || path.join(home, 'presenters'));
  if (!isInside(root, presentersDir)) throw new Error('UGC_PRESENTERS_DIR must be inside LINES_WORKER_ROOT');
  const presenters = loadPresenters(presentersDir);
  const baseUrl = process.env.LINES_API_BASE;
  if (!baseUrl) throw new Error('Set LINES_API_BASE');
  const client = createClient({
    baseUrl,
    token: readSecret(root, process.env.LINES_WORKER_TOKEN_FILE || path.join(secrets, 'ugc-worker-token')),
    fetchImpl,
  });
  const elevenKey = readSecret(root, process.env.ELEVENLABS_KEY_FILE || path.join(secrets, 'elevenlabs-key'));
  const falKey = readSecret(root, process.env.FAL_KEY_FILE || path.join(secrets, 'fal-key'));
  const pollMs = Number(process.env.LINES_WORKER_POLL_MS || 5000);
  const log = (level, fields) => console.error(JSON.stringify({ level, time: new Date().toISOString(), ...fields }));
  let stopped = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopped = true; });
  log('info', { code: 'worker_started', engine: 'ugc', presenters: presenters.ids });
  while (!stopped) {
    let claim = null;
    try {
      claim = await client.claim();
    } catch (error) {
      log('error', { code: 'claim_failed', message: sanitizeMessage(error.message) });
      await sleep(pollMs);
      continue;
    }
    if (!claim?.job) {
      await sleep(pollMs);
      continue;
    }
    log('info', { code: 'claimed', jobId: claim.job.id, presenter: claim.job.metadata?.presenter || 'default' });
    const result = await renderClaimedJob(claim.job, {
      client,
      tmpDir,
      presenters,
      elevenKey,
      falKey,
      ttsModel: process.env.UGC_TTS_MODEL || 'eleven_v3',
      resolution: process.env.UGC_RESOLUTION === '720p' ? '720p' : '1080p',
      fonts: { ar: process.env.UGC_FONT_AR, en: process.env.UGC_FONT_EN },
      fontsDir: process.env.UGC_FONTS_DIR || null,
      ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
      ffprobe: process.env.FFPROBE_BIN || 'ffprobe',
      fetchImpl,
      sleep,
      pollMs: Number(process.env.UGC_POLL_MS || 5000),
      heartbeatMs: Number(process.env.LINES_HEARTBEAT_MS || 30_000),
      log,
    });
    log('info', { code: 'finished', jobId: claim.job.id, ...result });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', code: 'boot', message: sanitizeMessage(error.message) }));
    process.exit(1);
  });
}
