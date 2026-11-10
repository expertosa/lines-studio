import path from 'node:path';
import { APP_SCOPES } from './constants.js';
import { generateToken } from './auth.js';
import { openStore } from './store.js';
import { resolveLimits } from './limits.js';
import {
  formatKeyLine,
  installAppKey,
  installWorkerKey,
  rotateKey,
  rotateWebhook,
} from './keys.js';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function flag(args, name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) fail(`missing value for --${name}`);
  return value;
}

function numberFlag(args, name) {
  const value = flag(args, name);
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) fail(`--${name} must be an integer`);
  return Number(value);
}

const [command, ...args] = process.argv.slice(2);
const dataDir = process.env.LINES_DATA_DIR;
if (!dataDir) fail('Set LINES_DATA_DIR.');
if (!path.isAbsolute(dataDir)) fail('LINES_DATA_DIR must be an absolute path.');

const defaults = resolveLimits({
  jobsPerHour: process.env.LINES_JOBS_PER_HOUR,
  videoSecondsPerMonth: process.env.LINES_VIDEO_SECONDS_PER_MONTH,
});
const store = openStore(dataDir);

try {
  if (command === 'create-app') {
    const tenantId = flag(args, 'tenant');
    if (!tenantId) fail('create-app requires --tenant');
    const scopes = (flag(args, 'scopes') || APP_SCOPES.join(',')).split(',').filter(Boolean);
    const result = installAppKey(store, {
      id: flag(args, 'id') || tenantId,
      tenantId,
      token: generateToken(),
      scopes,
      jobsPerHour: numberFlag(args, 'jobs-per-hour'),
      videoSecondsPerMonth: numberFlag(args, 'video-seconds-per-month'),
    }, defaults);
    process.stdout.write(formatKeyLine(result));
  } else if (command === 'create-worker') {
    const id = flag(args, 'id');
    if (!id) fail('create-worker requires --id');
    const engines = (flag(args, 'engines') || 'moneyprinter').split(',').filter(Boolean);
    const result = installWorkerKey(store, { id, token: generateToken(), engines });
    process.stdout.write(formatKeyLine(result));
  } else if (command === 'rotate-key') {
    const id = flag(args, 'id');
    if (!id) fail('rotate-key requires --id');
    process.stdout.write(formatKeyLine(rotateKey(store, id)));
  } else if (command === 'rotate-webhook') {
    const tenant = flag(args, 'tenant');
    if (!tenant) fail('rotate-webhook requires --tenant');
    process.stdout.write(formatKeyLine({ keyId: tenant, tenantId: tenant, webhookSecret: rotateWebhook(store, tenant).webhookSecret }));
  } else if (command === 'revoke') {
    const id = flag(args, 'id');
    if (!id) fail('revoke requires --id');
    const ok = store.revokeKey(id);
    if (!ok) fail('key not found');
    process.stdout.write(`revoked: ${id}\n`);
  } else if (command === 'list') {
    for (const key of store.listKeys()) {
      process.stdout.write([
        key.id,
        key.kind,
        key.tenantId || '-',
        key.status,
        key.tokenPrefix,
        key.scopes.join(','),
      ].join('\t') + '\n');
    }
  } else {
    fail('commands: create-app, create-worker, rotate-key, rotate-webhook, revoke, list');
  }
} catch (error) {
  fail(error.message);
} finally {
  store.close();
}
