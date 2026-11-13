import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createWorker } from './worker.js';
import { createHandler, writeStartupResponse } from './http.js';
import { resolveLimits } from './limits.js';
import { safeJoin } from './paths.js';
import { createTemplateEngine } from './engines/template.js';
import { openStore } from './store.js';
import { applyBootstrap } from './bootstrap.js';
import { installAppKey, installWorkerKey } from './keys.js';
import { createAuthLimiter } from './auth-limit.js';
import { acquireInstanceLock, bootFileFor, bootHasYielded, ensureBootId } from './instance-lock.js';
import { createPresence } from './presence.js';

function walkFiles(dir, visit) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, visit);
    else if (entry.isFile()) visit(full);
  }
}

async function defaultLookup(hostname) {
  const records = await dnsLookup(hostname, { all: true, verbatim: true });
  return records.map((record) => record.address);
}

export async function createApp(options) {
  if (!options?.dataDir) throw new Error('dataDir is required');
  const defaultEngine = options.defaultEngine || 'moneyprinter';
  if (!['moneyprinter', 'template'].includes(defaultEngine)) {
    throw new Error('default engine is not available');
  }
  const enableTemplate = options.enableTemplate !== undefined ? Boolean(options.enableTemplate) : true;
  if (defaultEngine === 'template' && !enableTemplate) {
    throw new Error('template engine is disabled');
  }
  const template = createTemplateEngine(options);
  fs.mkdirSync(options.dataDir, { recursive: true });
  const tmpDir = path.join(options.dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const bootFile = bootFileFor(options.lockHostname, options.lockBootFile);
  const bootId = ensureBootId(bootFile);
  let startupPhase = bootHasYielded(options.dataDir, bootId) ? 'deferred' : 'waiting';
  let liveHandler = null;
  const server = http.createServer((req, res) => {
    if (startupPhase === 'ready' && liveHandler) {
      liveHandler(req, res);
      return;
    }
    try {
      writeStartupResponse(req, res, startupPhase);
    } catch {
      if (!res.headersSent) res.writeHead(500).end();
    }
  });
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 0;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    server.close();
    throw error;
  }
  const bound = server.address();
  if (typeof options.onListen === 'function') options.onListen({ port: bound.port, host });
  if (enableTemplate) await template.check();
  let instanceLock;
  try {
    instanceLock = await acquireInstanceLock(options.dataDir, {
      waitMs: options.lockWaitMs,
      pollMs: options.lockPollMs,
      ttlMs: options.lockTtlMs,
      heartbeatMs: options.lockHeartbeatMs,
      handoffPollMs: options.lockHandoffPollMs,
      hostname: options.lockHostname,
      bootFile,
      bootId,
      onDefer() {
        startupPhase = 'deferred';
      },
    });
  } catch (error) {
    await new Promise((resolve) => server.close(() => resolve()));
    throw error;
  }
  const releaseLock = () => instanceLock.release();
  const now = options.now || (() => Date.now());
  const limits = resolveLimits(options.limits);
  let store;
  try {
    store = openStore(options.dataDir, { now });
    for (const key of options.keys || []) installAppKey(store, key, limits);
    for (const key of options.workerKeys || []) installWorkerKey(store, key);
    if (options.bootstrap?.length) applyBootstrap(store, options.bootstrap, limits);
  } catch (error) {
    try {
      store?.close();
    } catch {
      // The original error is the one callers need.
    }
    releaseLock();
    await new Promise((resolve) => server.close(() => resolve()));
    throw error;
  }
  const log = options.log || ((level, fields) => {
    console.error(JSON.stringify({ level, time: new Date(now()).toISOString(), ...fields }));
  });
  const ctx = {
    store,
    now,
    limits,
    dataDir: options.dataDir,
    tmpDir,
    enableTemplate,
    enableBlender: Boolean(options.enableBlender),
    enableUgc: Boolean(options.enableUgc),
    imageHosts: Array.isArray(options.imageHosts) ? options.imageHosts : [],
    defaultEngine,
    template,
    signingKey: options.signingKey || null,
    ffmpeg: options.ffmpegPath || template.ffmpeg,
    ffprobe: options.ffprobePath || template.ffprobe,
    pollMs: options.pollMs ?? 500,
    webhookLookup: options.webhookLookup || defaultLookup,
    webhookTransport: options.webhookTransport || null,
    webhookPorts: options.webhookPorts || new Set([443]),
    log,
    trustProxy: options.trustProxy === true || options.trustProxy === '1',
    trustedProxies: Array.isArray(options.trustedProxies) ? options.trustedProxies : undefined,
    presence: createPresence(),
    authFailures: createAuthLimiter({
      limit: options.authFailLimit ?? 10,
      windowMs: options.authFailWindowMs ?? 10 * 60 * 1000,
    }),
    sweepExpired() {
      for (const artifact of store.expiredArtifacts(now())) {
        try {
          fs.rmSync(safeJoin(options.dataDir, artifact.relativePath), { force: true });
        } catch {
          // The row stays so a later download can answer 410 instead of 404.
        }
      }
    },
    sweepOrphans() {
      const root = path.join(options.dataDir, 'artifacts');
      const known = new Set(store.referencedPaths());
      walkFiles(root, (file) => {
        const relative = path.relative(options.dataDir, file).split(path.sep).join('/');
        if (!known.has(relative)) fs.rmSync(file, { force: true });
      });
    },
  };
  const recovered = store.recoverRunning();
  ctx.sweepExpired();
  ctx.sweepOrphans();
  if (recovered.requeued || recovered.failed || recovered.cancelled) {
    log('info', { code: 'recovered', ...recovered });
  }
  const worker = createWorker(ctx);
  if (options.autostart !== false) worker.start();
  liveHandler = createHandler(ctx);
  startupPhase = 'ready';
  let closing = null;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      try {
        await worker.stop();
        if (server.listening) {
          await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
        }
        try {
          store.close();
        } catch {
          // Already closed.
        }
      } finally {
        releaseLock();
      }
    })();
    return closing;
  }
  instanceLock.watch(() => {
    void close().finally(() => {
      if (typeof options.onHandoff === 'function') {
        options.onHandoff({ id: instanceLock.id, hostname: instanceLock.hostname, bootId: instanceLock.bootId });
      }
    });
  });
  return {
    url: `http://127.0.0.1:${bound.port}`,
    port: bound.port,
    limits,
    store,
    templateReady: template.ready,
    async tick() {
      return worker.tick();
    },
    close,
  };
}
