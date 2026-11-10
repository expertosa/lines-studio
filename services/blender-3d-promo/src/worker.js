import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, sanitizeMessage } from './api.js';
import { assertOnDataVolume, isInside } from './paths.js';
import { renderPromo } from './render.js';
import { fromJob } from './spec.js';

/**
 * Render one claimed `promo3d` job and report it back to the Lines video API.
 * `deps.render` defaults to renderPromo; tests inject a fake.
 */
export async function renderClaimedJob(job, deps) {
  const controller = new AbortController();
  const beat = setInterval(() => {
    deps.client.heartbeat(job.id).then((body) => {
      if (body?.cancelRequested) controller.abort();
    }).catch((error) => {
      if (error.status === 409) controller.abort();
    });
  }, deps.heartbeatMs || 30_000);
  const deadline = job.deadlineAt ? Date.parse(job.deadlineAt) - (deps.now?.() ?? Date.now()) : 0;
  const deadlineTimer = deadline > 0 ? setTimeout(() => controller.abort(), deadline) : null;
  const workDir = path.join(deps.tmpDir, job.id);
  const outFile = path.join(workDir, 'promo.mp4');
  try {
    const spec = fromJob(job, { assetsDir: deps.assetsDir, quality: deps.quality || 'final' });
    const render = deps.render || renderPromo;
    const result = await render(spec, {
      workDir,
      outFile,
      blender: deps.blender,
      ffmpeg: deps.ffmpeg,
      music: deps.music || null,
      fonts: deps.fonts || {},
      fontsDir: deps.fontsDir || null,
      signal: controller.signal,
      onProgress: (event) => {
        if (event.stage === 'frames' && event.frame % 60 === 0) {
          deps.log?.('info', { code: 'progress', jobId: job.id, frame: event.frame, total: event.total });
        }
      },
    });
    await deps.client.upload(job.id, result.video, result.thumbnail);
    await deps.client.complete(job.id);
    return { status: 'succeeded' };
  } catch (error) {
    const code = controller.signal.aborted || error.code === 'cancelled' ? 'cancelled' : (error.code || 'render_failed');
    try {
      await deps.client.fail(job.id, {
        code,
        message: sanitizeMessage(error.message),
        retry: code !== 'cancelled' && error.retry !== false,
      });
    } catch (reportError) {
      deps.log?.('error', { code: 'fail_report', message: sanitizeMessage(reportError.message) });
    }
    return { status: 'failed', code };
  } finally {
    clearInterval(beat);
    if (deadlineTimer) clearTimeout(deadlineTimer);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

function readToken(root) {
  const file = process.env.LINES_WORKER_TOKEN_FILE;
  if (file) {
    const tokenPath = assertOnDataVolume(file);
    if (!isInside(root, tokenPath)) throw new Error('LINES_WORKER_TOKEN_FILE must be inside LINES_WORKER_ROOT');
    return fs.readFileSync(tokenPath, 'utf8').trim();
  }
  if (process.env.LINES_WORKER_TOKEN) return process.env.LINES_WORKER_TOKEN.trim();
  throw new Error('Set LINES_WORKER_TOKEN_FILE (preferred) or LINES_WORKER_TOKEN');
}

function insideRoot(root, value, fallback) {
  const target = assertOnDataVolume(value || fallback);
  if (!isInside(root, target)) throw new Error(`${target} must be inside LINES_WORKER_ROOT`);
  return target;
}

export async function main({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const root = assertOnDataVolume(process.env.LINES_WORKER_ROOT || '');
  const home = path.join(root, 'blender');
  const tmpDir = path.join(home, 'tmp');
  const cache = path.join(home, 'cache');
  for (const dir of [tmpDir, cache, path.join(home, 'logs')]) fs.mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = tmpDir;
  process.env.XDG_CACHE_HOME = cache;
  const assetsDir = insideRoot(root, process.env.PROMO_ASSETS_DIR, path.join(home, 'assets'));
  const music = process.env.PROMO_MUSIC ? insideRoot(root, process.env.PROMO_MUSIC) : null;
  const baseUrl = process.env.LINES_API_BASE;
  if (!baseUrl) throw new Error('Set LINES_API_BASE');
  const client = createClient({ baseUrl, token: readToken(root), fetchImpl });
  const pollMs = Number(process.env.LINES_WORKER_POLL_MS || 5000);
  const log = (level, fields) => console.error(JSON.stringify({ level, time: new Date().toISOString(), ...fields }));
  let stopped = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopped = true; });
  log('info', { code: 'worker_started', engine: 'blender', root });
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
    log('info', { code: 'claimed', jobId: claim.job.id, style: claim.job.style });
    const result = await renderClaimedJob(claim.job, {
      client,
      tmpDir,
      assetsDir,
      music,
      blender: process.env.BLENDER_BIN || '/Applications/Blender.app/Contents/MacOS/Blender',
      ffmpeg: process.env.FFMPEG_BIN || 'ffmpeg',
      quality: process.env.PROMO_QUALITY === 'draft' ? 'draft' : 'final',
      fonts: { ar: process.env.PROMO_FONT_AR, en: process.env.PROMO_FONT_EN },
      fontsDir: process.env.PROMO_FONTS_DIR || null,
      heartbeatMs: Number(process.env.LINES_HEARTBEAT_MS || 30_000),
      log,
    });
    log('info', { code: 'finished', jobId: claim.job.id, ...result });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', code: 'boot', message: String(error.message || 'boot failed') }));
    process.exit(1);
  });
}
