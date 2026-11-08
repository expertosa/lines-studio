import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { ALLOWED_PROVIDERS } from './constants.js';
import { createHandler } from './http.js';
import { resolveLimits } from './limits.js';
import { safeJoin } from './paths.js';
import { createDisabledProvider, createLocalProvider } from './render/local-ffmpeg.js';
import { openStore } from './store.js';
import { createWorker } from './worker.js';

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
        const busy = new Error('worker_already_running');
        busy.code = 'worker_already_running';
        throw busy;
      }
      try {
        fs.rmSync(lockPath, { force: true });
      } catch {
        // Another process removed it first.
      }
    }
  }
  const busy = new Error('worker_already_running');
  busy.code = 'worker_already_running';
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

export async function createApp(options) {
  if (!options?.dataDir) throw new Error('dataDir is required');
  if (!Array.isArray(options.credentials) || options.credentials.length === 0) {
    throw new Error('credentials are required');
  }
  const providerName = options.providerName || 'local-ffmpeg';
  if (options.provider && !options.allowProviderOverride) {
    throw new Error('provider override is not allowed');
  }
  if (!options.provider && !ALLOWED_PROVIDERS.includes(providerName)) {
    throw new Error('Unsupported provider. Paid and remote providers are not enabled.');
  }
  const provider = options.provider
    || (providerName === 'disabled' ? createDisabledProvider() : createLocalProvider(options));
  if (provider.paidCalls !== false || provider.generative !== false) {
    throw new Error('Paid or generative providers are not enabled.');
  }
  if (typeof provider.check === 'function') await provider.check();

  fs.mkdirSync(options.dataDir, { recursive: true });
  const tmpDir = path.join(options.dataDir, 'tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const releaseLock = acquireLock(options.dataDir);
  const now = options.now || (() => Date.now());
  const store = openStore(options.dataDir, { now });
  const limits = resolveLimits(options.limits);
  const log = options.log || ((level, fields) => {
    console.error(JSON.stringify({ level, time: new Date(now()).toISOString(), ...fields }));
  });
  const ctx = {
    credentials: options.credentials,
    provider,
    store,
    now,
    limits,
    dataDir: options.dataDir,
    tmpDir,
    ffmpeg: options.ffmpegPath || provider.ffmpeg || 'ffmpeg',
    ffprobe: options.ffprobePath || provider.ffprobe || 'ffprobe',
    pollMs: options.pollMs ?? 200,
    timeoutOverrideMs: options.timeoutOverrideMs,
    log,
    sweepExpired() {
      for (const artifact of store.expiredArtifacts(now())) {
        try {
          fs.rmSync(safeJoin(options.dataDir, artifact.relativePath), { force: true });
        } catch {
          // Continue so the database does not keep serving the row.
        }
        store.deleteArtifact(artifact.id);
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
  const recovered = store.recoverOrphanedRunning();
  ctx.sweepExpired();
  ctx.sweepOrphans();
  if (recovered.requeued || recovered.failed) {
    log('info', { code: 'recovered', requeued: recovered.requeued, failed: recovered.failed });
  }

  const worker = createWorker(ctx);
  if (options.worker !== false) worker.start();
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
    provider,
    limits,
    store,
    recovered,
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
