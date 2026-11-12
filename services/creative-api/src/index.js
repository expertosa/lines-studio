import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from './app.js';
import { parseTrustedProxies } from './auth-limit.js';
import { parseBootstrap } from './bootstrap.js';
import { waitForSuccessorExit } from './instance-lock.js';
import { resolveLimits } from './limits.js';

function fail(code, message) {
  console.error(JSON.stringify({ level: 'error', code, message }));
  process.exit(1);
}

function readBootstrap(env) {
  const file = env.LINES_BOOTSTRAP_KEYS_FILE;
  if (file) {
    if (!path.isAbsolute(file)) fail('bootstrap', 'LINES_BOOTSTRAP_KEYS_FILE must be an absolute path');
    const stat = fs.statSync(file);
    if ((stat.mode & 0o077) !== 0) {
      console.error(JSON.stringify({
        level: 'warn',
        code: 'bootstrap_file_perms',
        message: 'Bootstrap file is readable by group or others.',
      }));
    }
    return parseBootstrap(fs.readFileSync(file, 'utf8'));
  }
  if (env.LINES_BOOTSTRAP_KEYS) return parseBootstrap(env.LINES_BOOTSTRAP_KEYS);
  return [];
}

const defaultEngine = process.env.LINES_DEFAULT_ENGINE || 'moneyprinter';
const enableTemplate = (process.env.LINES_ENABLE_TEMPLATE ?? '1') !== '0';
const enableBlender = process.env.LINES_ENABLE_BLENDER === '1';
const enableUgc = process.env.LINES_ENABLE_UGC === '1';
const dataDir = process.env.LINES_DATA_DIR;
if (!dataDir) fail('config', 'Set LINES_DATA_DIR to a persistent directory.');

let limits;
try {
  limits = resolveLimits({
    jobsPerHour: process.env.LINES_JOBS_PER_HOUR,
    videoSecondsPerMonth: process.env.LINES_VIDEO_SECONDS_PER_MONTH,
    maxConcurrency: process.env.LINES_MAX_CONCURRENCY,
    deadlineMs: process.env.LINES_JOB_DEADLINE_MS,
    artifactTtlMs: process.env.LINES_ARTIFACT_TTL_MS,
    leaseMs: process.env.LINES_LEASE_MS,
    maxAttempts: process.env.LINES_MAX_ATTEMPTS,
    webhookTimeoutMs: process.env.LINES_WEBHOOK_TIMEOUT_MS,
    webhookMaxAttempts: process.env.LINES_WEBHOOK_MAX_ATTEMPTS,
    templateTimeoutMs: process.env.LINES_TEMPLATE_TIMEOUT_MS,
    signedUrlTtlMs: process.env.LINES_SIGNED_URL_TTL_MS,
  });
} catch (error) {
  fail('config', error.message);
}

let bootstrap = [];
try {
  bootstrap = readBootstrap(process.env);
} catch (error) {
  fail('bootstrap', error.message);
}

let trustedProxies;
try {
  trustedProxies = parseTrustedProxies(process.env.LINES_TRUSTED_PROXIES);
} catch (error) {
  fail('config', error.message);
}

const ports = (process.env.LINES_WEBHOOK_PORTS || '443')
  .split(',')
  .map((item) => Number(item.trim()))
  .filter((item) => Number.isInteger(item) && item > 0 && item < 65536);

const lockHostname = process.env.LINES_LOCK_HOSTNAME || os.hostname();
let active = null;
let shuttingDown = false;

function onSignal() {
  if (shuttingDown) return;
  shuttingDown = true;
  const current = active;
  if (!current) {
    process.exit(0);
    return;
  }
  current.close().then(() => process.exit(0), () => process.exit(1));
}

process.on('SIGTERM', onSignal);
process.on('SIGINT', onSignal);

const appOptions = {
  dataDir,
  defaultEngine,
  enableTemplate,
  enableBlender,
  enableUgc,
  signingKey: process.env.LINES_SIGNING_KEY || null,
  host: process.env.LINES_HOST || '127.0.0.1',
  port: Number(process.env.LINES_PORT || 8080),
  ffmpegPath: process.env.LINES_FFMPEG,
  ffprobePath: process.env.LINES_FFPROBE,
  arabicFont: process.env.LINES_FONT_ARABIC,
  arabicFamily: process.env.LINES_FONT_ARABIC_FAMILY,
  latinFont: process.env.LINES_FONT_LATIN,
  latinFamily: process.env.LINES_FONT_LATIN_FAMILY,
  limits,
  bootstrap,
  webhookPorts: new Set(ports.length ? ports : [443]),
  trustProxy: process.env.LINES_TRUST_PROXY === '1',
  trustedProxies,
  lockHostname,
  onListen({ port }) {
    console.error(JSON.stringify({ level: 'info', code: 'bind', port, ready: false }));
  },
};

while (!shuttingDown) {
  let reportHandoff;
  const handed = new Promise((resolve) => {
    reportHandoff = resolve;
  });
  let app;
  try {
    app = await createApp({
      ...appOptions,
      onHandoff(info) {
        console.error(JSON.stringify({ level: 'info', code: 'lock_idle', hostname: lockHostname }));
        reportHandoff(info);
      },
    });
  } catch (error) {
    fail('boot', error.message);
  }
  active = app;
  console.error(JSON.stringify({
    level: 'info',
    code: 'listening',
    port: app.port,
    ready: true,
    defaultEngine,
    templateReady: app.templateReady,
  }));
  const successor = await handed;
  if (shuttingDown) break;
  const outcome = await waitForSuccessorExit(dataDir, successor, {
    shouldStop: () => shuttingDown,
  });
  if (outcome === 'stop' || shuttingDown) break;
  active = null;
}
