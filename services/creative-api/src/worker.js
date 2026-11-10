import fs from 'node:fs';
import { BUILTIN_WORKER_ID } from './constants.js';
import { CodedError } from './errors.js';
import { safeJoin } from './paths.js';
import { storeFile } from './artifacts.js';
import { dispatchWebhooks } from './webhooks.js';

const PUBLIC_ERRORS = {
  RENDER_TIMEOUT: ['render_timeout', 'Render timed out.', false],
  RENDER_FAILED: ['render_failed', 'Render failed.', true],
  FONT_UNAVAILABLE: ['font_unavailable', 'Required font is not installed.', false],
  ARTIFACT_REJECTED: ['artifact_rejected', 'Output did not pass media checks.', false],
  CANCELLED: ['cancelled', 'Cancelled.', false],
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

export function createWorker(ctx) {
  let stopped = false;
  let ticking = false;
  let currentAbort = null;
  let currentJobId = null;

  async function renderClaimed(job) {
    const abort = new AbortController();
    currentAbort = abort;
    currentJobId = job.id;
    const timer = setTimeout(() => abort.abort('timeout'), ctx.limits.templateTimeoutMs);
    const beatMs = Math.min(5000, Math.max(50, Math.floor(ctx.limits.leaseMs / 3)));
    const beat = setInterval(() => {
      try {
        if (ctx.store.isCancelRequested(job.id)) abort.abort('cancel');
        else ctx.store.heartbeat(job.id, BUILTIN_WORKER_ID, ctx.limits.leaseMs);
      } catch {
        abort.abort('cancel');
      }
    }, beatMs);
    const workDir = safeJoin(ctx.tmpDir, job.id);
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });
    try {
      const output = await ctx.template.render(job, { signal: abort.signal, workDir });
      if (abort.signal.aborted) throw new CodedError('CANCELLED', 'Cancelled.');
      const saved = await storeFile(ctx, job, BUILTIN_WORKER_ID, output.filePath, {
        role: 'video',
        mime: 'video/mp4',
        template: true,
      });
      if (saved.mismatch) return;
      if (!saved.artifact) {
        ctx.store.fail(job.id, BUILTIN_WORKER_ID, {
          code: 'artifact_rejected',
          message: 'Output did not pass media checks.',
          retry: false,
        });
        return;
      }
      ctx.store.complete(job.id, BUILTIN_WORKER_ID);
    } catch (error) {
      if (abort.signal.reason === 'shutdown' || error?.code === 'SHUTDOWN') {
        ctx.store.releaseForShutdown(job.id, BUILTIN_WORKER_ID);
        return;
      }
      const mapped = PUBLIC_ERRORS[error?.code] || PUBLIC_ERRORS.RENDER_FAILED;
      ctx.log('error', { jobId: job.id, code: mapped[0] });
      ctx.store.fail(job.id, BUILTIN_WORKER_ID, {
        code: mapped[0],
        message: mapped[1],
        retry: mapped[2] && error?.code !== 'CANCELLED',
      });
    } finally {
      clearTimeout(timer);
      clearInterval(beat);
      fs.rmSync(workDir, { recursive: true, force: true });
      if (currentAbort === abort) currentAbort = null;
      currentJobId = null;
    }
  }

  const worker = {
    async tick() {
      if (ticking || stopped) return false;
      ticking = true;
      try {
        ctx.store.sweep(ctx.now());
        ctx.sweepExpired();
        let rendered = false;
        if (ctx.enableTemplate && ctx.template?.ready) {
          const claimed = ctx.store.claimNext({
            engines: ['template'],
            owner: BUILTIN_WORKER_ID,
            leaseMs: ctx.limits.leaseMs,
            concurrency: ctx.limits.maxConcurrency,
          });
          if (claimed.job) {
            await renderClaimed(claimed.job);
            rendered = true;
          }
        }
        await dispatchWebhooks(ctx);
        return rendered;
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
            ctx.log('error', { code: 'worker', message: String(error?.message || 'worker').slice(0, 200) });
          }
          if (!stopped) await sleep(ctx.pollMs, () => stopped);
        }
      })();
      return this.loop;
    },
    async stop() {
      stopped = true;
      if (currentAbort) currentAbort.abort('shutdown');
      if (currentJobId) ctx.store.releaseForShutdown(currentJobId, BUILTIN_WORKER_ID);
      if (this.loop) await this.loop;
    },
  };
  return worker;
}
