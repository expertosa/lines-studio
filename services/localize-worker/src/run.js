import fs from 'node:fs';
import path from 'node:path';
import {
  ALEPH_MAX_SECONDS,
  ALEPH_MIN_SECONDS,
  costForJob,
  packAlephPasses,
} from '../../creative-api/src/engines/localize.js';
import { sanitizeMessage } from './api.js';
import { downloadHttps as downloadHeygen, runHeygenPrecision } from './heygen_translate.js';
import { downloadHttps as downloadRunway, runAlephSwap } from './runway_aleph.js';

function fail(message, code, retry = false) {
  return Object.assign(new Error(message), { code, retry });
}

/**
 * Claimed `localize` job -> MP4:
 * 1. Duration-based cost estimate; refuse to start if it exceeds LINES_LOCALIZE_MAX_USD.
 * 2. Each packed Aleph 2.0 pass applies visual swaps (characters, outfits, products, scenes).
 * 3. If dub is requested, HeyGen Precision translates to Arabic (Saudi Arabia) with lip-sync.
 * 4. Download the result and upload it to the API.
 *
 * Missing keys fail with engine_not_configured before any vendor call. Success is only
 * reported after a real output file is uploaded. This never makes a live paid call from tests
 * because fetchImpl is injected.
 */
export async function renderClaimedJob(job, deps) {
  const controller = new AbortController();
  const beat = setInterval(() => {
    deps.client.heartbeat(job.id).then((body) => {
      if (body?.cancelRequested) controller.abort();
    }).catch((error) => {
      if (error.status === 409) controller.abort();
    });
  }, deps.heartbeatMs || 30_000);
  const workDir = path.join(deps.tmpDir, job.id);
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  const signal = controller.signal;
  try {
    if (job.engine !== 'localize') throw fail('this worker only renders localize jobs', 'render_failed', false);
    const spec = job.localize;
    if (!spec?.source?.url) throw fail('localize.source.url is required', 'render_failed', false);

    const cost = costForJob(job, deps.env || process.env);
    if (!cost.durationSupported) {
      throw fail(
        `Aleph 2.0 accepts source clips of ${ALEPH_MIN_SECONDS}–${ALEPH_MAX_SECONDS} seconds; this job is ${job.seconds}s`,
        'duration_unsupported',
        false,
      );
    }
    if (!cost.withinCap) {
      throw fail(
        `estimated cost $${cost.estimateUsd.toFixed(2)} exceeds the per-job cap of $${cost.capUsd.toFixed(2)}`,
        'cost_cap_exceeded',
        false,
      );
    }

    const swaps = Array.isArray(spec.swaps) ? spec.swaps : [];
    const passes = packAlephPasses(swaps);
    const needsAleph = passes.length > 0;
    const needsHeygen = Boolean(spec.dub);
    if (!needsAleph && !needsHeygen) {
      throw fail('this job has no visual swaps and no dub, so the localize worker has nothing to render', 'nothing_to_render', false);
    }
    if (needsAleph && !deps.runwayKey) throw fail('Runway API key is not configured', 'engine_not_configured', false);
    if (needsHeygen && !deps.heygenKey) throw fail('HeyGen API key is not configured', 'engine_not_configured', false);

    let videoUrl = spec.source.url;
    for (const pass of passes) {
      const result = await runAlephSwap({
        apiKey: deps.runwayKey,
        videoUri: videoUrl,
        promptText: pass.promptText,
        keyframes: pass.keyframes,
        fetchImpl: deps.fetchImpl,
        sleep: deps.sleep,
        signal,
        pollMs: deps.runwayPollMs || deps.pollMs || 5000,
        heartbeat: () => deps.client.heartbeat(job.id),
        deadlineAt: job.deadlineAt,
        now: deps.now,
      });
      videoUrl = result.outputUrl;
    }

    if (needsHeygen) {
      const translated = await runHeygenPrecision({
        apiKey: deps.heygenKey,
        videoUrl,
        title: job.title,
        fetchImpl: deps.fetchImpl,
        sleep: deps.sleep,
        signal,
        pollMs: deps.heygenPollMs || 30_000,
        heartbeat: () => deps.client.heartbeat(job.id),
        deadlineAt: job.deadlineAt,
        now: deps.now,
      });
      videoUrl = translated.videoUrl;
    }

    const download = needsHeygen ? downloadHeygen : downloadRunway;
    const bytes = await download(videoUrl, deps.fetchImpl, signal);
    if (!bytes?.length) throw fail('downloaded video was empty', 'render_failed', false);
    const finalPath = path.join(workDir, 'localize.mp4');
    fs.writeFileSync(finalPath, bytes);
    await deps.client.upload(job.id, finalPath, null);
    await deps.client.complete(job.id);
    return { status: 'succeeded', cost };
  } catch (error) {
    const code = signal.aborted || error.code === 'cancelled' ? 'cancelled' : (error.code || 'render_failed');
    try {
      await deps.client.fail(job.id, { code, message: sanitizeMessage(error.message), retry: code !== 'cancelled' && error.retry === true });
    } catch (reportError) {
      deps.log?.('error', { code: 'fail_report', message: sanitizeMessage(reportError.message) });
    }
    return { status: 'failed', code };
  } finally {
    clearInterval(beat);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
