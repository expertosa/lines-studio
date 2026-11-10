import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from './api.js';
import { renderClaimedJob } from './run.js';
import { assertOnDataVolume, isInside } from './paths.js';

function readToken(root) {
  const file = process.env.LINES_WORKER_TOKEN_FILE;
  if (file) {
    const tokenPath = assertOnDataVolume(file);
    if (!isInside(root, tokenPath)) throw new Error('LINES_WORKER_TOKEN_FILE must be inside LINES_WORKER_ROOT');
    return fs.readFileSync(tokenPath, 'utf8').trim();
  }
  const fromEnv = process.env.LINES_WORKER_TOKEN;
  if (fromEnv) return fromEnv.trim();
  throw new Error('Set LINES_WORKER_TOKEN_FILE (preferred) or LINES_WORKER_TOKEN');
}

export function prepareRoot() {
  const root = assertOnDataVolume(process.env.LINES_WORKER_ROOT || '');
  const checkout = assertOnDataVolume(process.env.MPT_CHECKOUT || path.join(root, 'MoneyPrinterTurbo'));
  if (!isInside(root, checkout)) throw new Error('MPT_CHECKOUT must be inside LINES_WORKER_ROOT');
  if (!fs.existsSync(checkout)) {
    throw new Error('MoneyPrinterTurbo checkout is missing under LINES_WORKER_ROOT');
  }
  const tmp = path.join(root, 'tmp');
  const cache = path.join(root, 'cache');
  const logs = path.join(root, 'logs');
  fs.mkdirSync(tmp, { recursive: true });
  fs.mkdirSync(cache, { recursive: true });
  fs.mkdirSync(logs, { recursive: true });
  process.env.TMPDIR = tmp;
  process.env.XDG_CACHE_HOME = cache;
  return { root, checkout };
}

export async function main({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
  const { root } = prepareRoot();
  const token = readToken(root);
  const baseUrl = process.env.LINES_API_BASE;
  const mptBaseUrl = process.env.MPT_BASE_URL || 'http://127.0.0.1:8080';
  if (!baseUrl) throw new Error('Set LINES_API_BASE');
  const client = createClient({ baseUrl, token, fetchImpl });
  const pollMs = Number(process.env.LINES_WORKER_POLL_MS || 5000);
  const log = (level, fields) => {
    console.error(JSON.stringify({ level, time: new Date().toISOString(), ...fields }));
  };
  let stopped = false;
  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => {
      stopped = true;
    });
  }
  log('info', { code: 'worker_started', root });
  while (!stopped) {
    let claim = null;
    try {
      claim = await client.claim();
    } catch (error) {
      log('error', { code: 'claim_failed', message: String(error.message || '').slice(0, 200) });
      await sleep(pollMs);
      continue;
    }
    if (!claim?.job) {
      await sleep(pollMs);
      continue;
    }
    log('info', { code: 'claimed', jobId: claim.job.id, style: claim.job.style });
    await renderClaimedJob(claim.job, {
      client,
      workerRoot: root,
      mptBaseUrl,
      fetchImpl,
      fontName: process.env.MPT_FONT_NAME,
      sleep,
      pollMs: Number(process.env.MPT_POLL_MS || 3000),
      heartbeatMs: Number(process.env.LINES_HEARTBEAT_MS || 30_000),
      log,
    });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', code: 'boot', message: String(error.message || 'boot failed') }));
    process.exit(1);
  });
}
