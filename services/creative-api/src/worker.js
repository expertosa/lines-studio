import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CodedError } from './errors.js';
import { isInside, safeJoin } from './paths.js';
import { inspectMedia } from './render/inspect.js';

const PUBLIC_ERRORS = {
  RENDER_TIMEOUT: ['render_timeout', 'Render timed out.'],
  RENDER_FAILED: ['render_failed', 'Render failed.'],
  FONT_UNAVAILABLE: ['font_unavailable', 'Required font is not installed.'],
  ARTIFACT_REJECTED: ['artifact_rejected', 'Output did not pass media checks.'],
  PROVIDER_UNAVAILABLE: ['provider_unavailable', 'Creative provider is disabled. No paid provider is configured.'],
};

function sleep(ms, shouldStop) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(watch);
      resolve();
    };
    const watch = setInterval(() => {
      if (shouldStop()) finish();
    }, 20);
    const timer = setTimeout(finish, ms);
  });
}

function abortError(signal) {
  if (signal?.reason === 'timeout') return new CodedError('RENDER_TIMEOUT', 'Render timed out.');
  if (signal?.reason === 'cancel') return new CodedError('CANCELLED', 'Cancelled.');
  if (signal?.reason === 'shutdown') return new CodedError('SHUTDOWN', 'Shutting down.');
  return new CodedError('RENDER_FAILED', 'Render aborted.');
}

function whenAborted(signal) {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(abortError(signal)), { once: true });
  });
}

function safeLogMessage(message) {
  const text = String(message || '');
  if (/https?:|www\.|file:/i.test(text)) return 'rejected output';
  return text.slice(0, 300);
}

export function createWorker(ctx) {
  let stopped = false;
  let ticking = false;
  let currentAbort = null;
  const worker = {
    async tick() {
      if (ticking || stopped) return false;
      ticking = true;
      try {
        ctx.store.expireQueued(ctx.now());
        ctx.sweepExpired();
        const job = ctx.store.claimNext({
          globalLimit: ctx.limits.maxRunningGlobal,
          perTenantLimit: ctx.limits.maxRunningPerTenant,
        });
        if (!job) return false;
        await runJob(job);
        return true;
      } finally {
        ticking = false;
      }
    },
    start() {
      this.loop = (async () => {
        while (!stopped) {
          try {
            await this.tick();
          } catch (error) {
            ctx.log('error', { code: 'worker', message: safeLogMessage(error.message) });
          }
          if (!stopped) await sleep(ctx.pollMs, () => stopped);
        }
      })();
      return this.loop;
    },
    async stop() {
      stopped = true;
      if (currentAbort) currentAbort.abort('shutdown');
      if (this.loop) await this.loop;
    },
  };

  async function runJob(job) {
    const abort = new AbortController();
    currentAbort = abort;
    let settled = false;
    const timer = setTimeout(() => abort.abort('timeout'), job.timeoutMs);
    const cancelWatch = setInterval(() => {
      try {
        if (ctx.store.isCancelRequested(job.id)) abort.abort('cancel');
      } catch {
        abort.abort('cancel');
      }
    }, 50);
    const beat = setInterval(() => {
      try {
        ctx.store.heartbeat(job.id, ctx.now());
      } catch {
        // The row may already be terminal.
      }
    }, 1000);
    const workDir = safeJoin(ctx.tmpDir, job.id);
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });

    function finishFailure(error) {
      if (settled) return;
      settled = true;
      const reason = abort.signal.reason;
      if (reason === 'shutdown' || error?.code === 'SHUTDOWN') {
        ctx.store.releaseForShutdown(job.id);
        return;
      }
      if (reason === 'cancel' || error?.code === 'CANCELLED' || ctx.store.isCancelRequested(job.id)) {
        ctx.store.markCancelled(job.id, ctx.now());
        return;
      }
      const mapped = PUBLIC_ERRORS[error?.code] || PUBLIC_ERRORS.RENDER_FAILED;
      ctx.log('error', { jobId: job.id, code: mapped[0], message: safeLogMessage(error?.message) });
      ctx.store.markFailed(job.id, mapped[0], mapped[1], { terminal: true });
    }

    try {
      if (ctx.provider.paidCalls !== false || ctx.provider.generative !== false) {
        finishFailure(new CodedError('PROVIDER_UNAVAILABLE', 'Paid providers are not enabled.'));
        return;
      }
      if (!ctx.provider.ready) {
        finishFailure(new CodedError('PROVIDER_UNAVAILABLE', 'Provider is not ready.'));
        return;
      }
      const renderPromise = Promise.resolve().then(() => ctx.provider.render(job, {
        signal: abort.signal,
        workDir,
      }));
      renderPromise.catch(() => {});
      let output;
      try {
        output = await Promise.race([renderPromise, whenAborted(abort.signal)]);
      } catch (error) {
        finishFailure(error);
        return;
      }
      if (abort.signal.aborted || ctx.store.isCancelRequested(job.id)) {
        finishFailure(abortError(abort.signal));
        return;
      }
      if (!output || typeof output.filePath !== 'string' || typeof output.mime !== 'string') {
        finishFailure(new CodedError('ARTIFACT_REJECTED', 'renderer returned no file'));
        return;
      }
      let realFile;
      try {
        realFile = fs.realpathSync(output.filePath);
        const realWork = fs.realpathSync(workDir);
        if (!isInside(realWork, realFile)) {
          finishFailure(new CodedError('ARTIFACT_REJECTED', 'output escaped the work directory'));
          return;
        }
      } catch {
        finishFailure(new CodedError('ARTIFACT_REJECTED', 'output path is not a local file'));
        return;
      }
      const expected = job.kind === 'video' ? 'video/mp4' : 'image/png';
      if (output.mime !== expected) {
        finishFailure(new CodedError('ARTIFACT_REJECTED', 'unexpected mime'));
        return;
      }
      let inspected;
      try {
        inspected = await inspectMedia({
          filePath: realFile,
          mime: output.mime,
          brief: job.brief,
          ffmpeg: ctx.ffmpeg,
          ffprobe: ctx.ffprobe,
        });
      } catch (error) {
        finishFailure(error.code ? error : new CodedError('ARTIFACT_REJECTED', error.message));
        return;
      }
      if (abort.signal.aborted || ctx.store.isCancelRequested(job.id)) {
        finishFailure(abortError(abort.signal));
        return;
      }
      const artifactId = randomUUID();
      const extension = output.mime === 'video/mp4' ? '.mp4' : '.png';
      const relativePath = path.posix.join('artifacts', job.id, `${artifactId}${extension}`);
      const destination = safeJoin(ctx.dataDir, relativePath);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(realFile, destination);
      const descriptor = fs.openSync(destination, 'r+');
      fs.fsyncSync(descriptor);
      fs.closeSync(descriptor);
      const bytes = fs.readFileSync(destination);
      if (bytes.length !== inspected.byteSize) {
        fs.rmSync(destination, { force: true });
        finishFailure(new CodedError('ARTIFACT_REJECTED', 'output size changed'));
        return;
      }
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      let saved;
      try {
        saved = ctx.store.markSucceeded(job.id, {
          id: artifactId,
          classification: 'rendered',
          mime: output.mime,
          byteSize: bytes.length,
          sha256,
          width: inspected.width,
          height: inspected.height,
          durationMs: inspected.durationMs,
          lumaStdev: inspected.lumaStdev,
          relativePath,
          expiresAt: ctx.now() + job.artifactTtlMs,
        });
      } catch (error) {
        fs.rmSync(destination, { force: true });
        throw error;
      }
      if (!saved.job || saved.job.status !== 'succeeded') {
        fs.rmSync(destination, { force: true });
        if (saved.cancelled) ctx.store.markCancelled(job.id, ctx.now());
        settled = true;
        return;
      }
      settled = true;
    } catch (error) {
      finishFailure(error);
    } finally {
      clearTimeout(timer);
      clearInterval(cancelWatch);
      clearInterval(beat);
      fs.rmSync(workDir, { recursive: true, force: true });
      if (currentAbort === abort) currentAbort = null;
    }
  }

  return worker;
}
