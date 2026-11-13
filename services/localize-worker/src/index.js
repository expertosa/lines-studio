import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient, sanitizeMessage } from './api.js';
import { renderClaimedJob } from './run.js';

function readEnvKey(names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && String(value).trim()) return String(value).trim();
  }
  return '';
}

function readSecretFile(file) {
  if (!file) return '';
  const stat = fs.statSync(file);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${path.basename(file)} must be mode 0600`);
  return fs.readFileSync(file, 'utf8').trim();
}

function loadKey(envNames, fileEnv, defaultFile) {
  const fromEnv = readEnvKey(envNames);
  if (fromEnv) return fromEnv;
  const file = process.env[fileEnv] || defaultFile;
  if (file && fs.existsSync(file)) return readSecretFile(file);
  return '';
}

export async function main({ fetchImpl = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const root = process.env.LINES_WORKER_ROOT || '';
  const home = root ? path.join(root, 'localize') : path.join(process.cwd(), 'var');
  const tmpDir = path.join(home, 'tmp');
  for (const dir of [tmpDir, path.join(home, 'logs')]) fs.mkdirSync(dir, { recursive: true });
  process.env.TMPDIR = tmpDir;
  const secrets = root ? path.join(root, 'secrets') : path.join(home, 'secrets');
  const baseUrl = process.env.LINES_API_BASE;
  if (!baseUrl) throw new Error('Set LINES_API_BASE');
  const token = readEnvKey(['LINES_WORKER_TOKEN']) || readSecretFile(process.env.LINES_WORKER_TOKEN_FILE || path.join(secrets, 'localize-worker-token'));
  const client = createClient({ baseUrl, token, fetchImpl });
  // Prefer env names from the task; accept the official Runway SDK name as an alias.
  const runwayKey = loadKey(['RUNWAY_API_KEY', 'RUNWAYML_API_SECRET'], 'RUNWAY_API_KEY_FILE', path.join(secrets, 'runway-key'));
  const heygenKey = loadKey(['HEYGEN_API_KEY'], 'HEYGEN_API_KEY_FILE', path.join(secrets, 'heygen-key'));
  const pollMs = Number(process.env.LINES_WORKER_POLL_MS || 5000);
  const log = (level, fields) => console.error(JSON.stringify({ level, time: new Date().toISOString(), ...fields }));
  let stopped = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopped = true; });
  log('info', {
    code: 'worker_started',
    engine: 'localize',
    runwayConfigured: Boolean(runwayKey),
    heygenConfigured: Boolean(heygenKey),
  });
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
    log('info', { code: 'claimed', jobId: claim.job.id, swaps: claim.job.localize?.swaps?.length || 0, dub: Boolean(claim.job.localize?.dub) });
    const result = await renderClaimedJob(claim.job, {
      client,
      tmpDir,
      runwayKey,
      heygenKey,
      fetchImpl,
      sleep,
      pollMs,
      runwayPollMs: Number(process.env.RUNWAY_POLL_MS || 5000),
      heygenPollMs: Number(process.env.HEYGEN_POLL_MS || 30_000),
      heartbeatMs: Number(process.env.LINES_HEARTBEAT_MS || 30_000),
      env: process.env,
      log,
    });
    log('info', { code: 'finished', jobId: claim.job.id, status: result.status, error: result.code || undefined });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main().catch((error) => {
    console.error(JSON.stringify({ level: 'error', code: 'boot', message: sanitizeMessage(error.message) }));
    process.exit(1);
  });
}
