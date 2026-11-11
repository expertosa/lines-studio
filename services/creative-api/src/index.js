import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { parseBootstrap } from './bootstrap.js';
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

const ports = (process.env.LINES_WEBHOOK_PORTS || '443')
  .split(',')
  .map((item) => Number(item.trim()))
  .filter((item) => Number.isInteger(item) && item > 0 && item < 65536);

let app;
try {
  app = await createApp({
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
  });
} catch (error) {
  fail('boot', error.message);
}

console.error(JSON.stringify({
  level: 'info',
  code: 'listening',
  port: app.port,
  defaultEngine,
  templateReady: app.templateReady,
}));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
