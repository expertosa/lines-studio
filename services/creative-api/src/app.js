import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { lookup as dnsLookup } from 'node:dns/promises';
import { createWorker } from './worker.js';
import { createHandler } from './http.js';
import { resolveLimits } from './limits.js';
import { safeJoin } from './paths.js';
import { createTemplateEngine } from './engines/template.js';
import { openStore } from './store.js';
import { applyBootstrap } from './bootstrap.js';
import { installAppKey, installWorkerKey } from './keys.js';

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function acquireLock(dir) {
  const lockPath = path.join(dir, 'worker.lock');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => {
        try {
          if (fs.readFileSync(lockPath, 'utf8').trim() === String(process.pid)) fs.rmSync(lockPath, { force: true });
        } catch {
          // The lock is already gone.
        }
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let pid = 0;
      try {
        pid = Number(fs.readFileSync(lockPath, 'utf8'));
      } catch {
        pid = 0;
      }
      if (pid && alive(pid)) {
        const busy = new Error('api_already_running');
        busy.code = 'api_already_running';
        throw busy;
      }
      try {
        fs.rmSync(lockPath, { force: true });
      } catch {
        // Another process removed it first.
      }
    }
  }
  const busy = new Error('api_already_running');
  busy.code = 'api_already_running';
  throw busy;
}

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
  if (enableTemplate) await template.check();
  fs.mkdirSync(options.dataDir, { recursive: true });
  const tmpDir = path.join(options.dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const releaseLock = acquireLock(options.dataDir);
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
  const server = http.createServer(createHandler(ctx));
  const host = options.host || '127.0.0.1';
  const port = options.port ?? 0;
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, resolve);
    });
  } catch (error) {
    await worker.stop();
    store.close();
    releaseLock();
    throw error;
  }
  const address = server.address();
  let closed = false;
  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    limits,
    store,
    templateReady: template.ready,
    async tick() {
      return worker.tick();
    },
    async close() {
      if (closed) return;
      closed = true;
      await worker.stop();
      await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
      store.close();
      releaseLock();
    },
  };
}
