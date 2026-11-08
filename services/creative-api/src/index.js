import { loadCredentialsFromEnv } from './auth.js';
import { createApp } from './app.js';
import { ALLOWED_PROVIDERS } from './constants.js';

function fail(code, message) {
  console.error(JSON.stringify({ level: 'error', code, message }));
  process.exit(1);
}

const providerName = process.env.LINES_CREATIVE_PROVIDER || 'local-ffmpeg';
if (!ALLOWED_PROVIDERS.includes(providerName)) {
  fail('unsupported_provider', 'Only local-ffmpeg or disabled are supported. Paid providers are not enabled.');
}

let loaded;
try {
  loaded = loadCredentialsFromEnv(process.env);
} catch (error) {
  fail('credentials', error.message);
}

const dataDir = process.env.LINES_CREATIVE_DATA_DIR || new URL('../data/', import.meta.url).pathname;
let app;
try {
  app = await createApp({
    dataDir,
    credentials: loaded.credentials,
    providerName,
    host: process.env.LINES_CREATIVE_HOST || '127.0.0.1',
    port: Number(process.env.LINES_CREATIVE_PORT || 8080),
    ffmpegPath: process.env.LINES_CREATIVE_FFMPEG,
    ffprobePath: process.env.LINES_CREATIVE_FFPROBE,
    arabicFont: process.env.LINES_CREATIVE_FONT_ARABIC,
    arabicFamily: process.env.LINES_CREATIVE_FONT_ARABIC_FAMILY,
    latinFont: process.env.LINES_CREATIVE_FONT_LATIN,
    latinFamily: process.env.LINES_CREATIVE_FONT_LATIN_FAMILY,
    limits: {
      maxJobsPerHour: process.env.LINES_CREATIVE_MAX_JOBS_PER_HOUR,
      maxRunningGlobal: process.env.LINES_CREATIVE_MAX_RUNNING,
      deadlineMs: process.env.LINES_CREATIVE_DEADLINE_MS,
      artifactTtlMs: process.env.LINES_CREATIVE_ARTIFACT_TTL_MS,
    },
  });
} catch (error) {
  fail('boot', error.message);
}

if (loaded.credentialsFilePermissive) {
  console.error(JSON.stringify({
    level: 'warn',
    code: 'credentials_file_perms',
    message: 'Credentials file is readable by group or others.',
  }));
}

console.error(JSON.stringify({
  level: 'info',
  code: 'listening',
  port: app.port,
  provider: providerName,
  ready: app.provider.ready,
  paidCalls: false,
  publishSupported: false,
}));

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}
