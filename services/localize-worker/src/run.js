import fs from 'node:fs';
import path from 'node:path';
import {
  ALEPH_MAX_SECONDS,
  ALEPH_MIN_SECONDS,
  GEMINI_EDIT_MAX_SECONDS,
  costForJob,
  geminiSegments,
  packAlephPasses,
  swapPrompt,
} from '../../creative-api/src/engines/localize.js';
import { sanitizeMessage } from './api.js';
import { assertGeminiReady, runGeminiEdit, uploadToGcs } from './gemini_edit.js';
import { downloadHttps as downloadHeygen, runHeygenPrecision } from './heygen_translate.js';
import {
  assertLocalReady,
  concatVideos,
  lipSync,
  localConfig,
  probeSeconds,
  runCommand,
  splitVideo,
  synthesizeSaudi,
} from './local_tools.js';
import { downloadHttps as downloadRunway, runAlephSwap } from './runway_aleph.js';

function fail(message, code, retry = false) {
  return Object.assign(new Error(message), { code, retry });
}

/** Allow the dubbed line to run a little past the picture; MuseTalk follows the audio length. */
const DUB_OVERRUN_SECONDS = 0.5;

/**
 * Free and economy tiers: (economy only) Gemini Omni Flash swaps per ≤15 s segment,
 * then a local Saudi voice for `captions.text` and local MuseTalk lip-sync. Every
 * tool is checked before the first paid call, and success needs a real output file.
 */
async function renderLocalTier(job, deps, { workDir, signal, cost }) {
  const spec = job.localize;
  const tier = spec.tier;
  const swaps = Array.isArray(spec.swaps) ? spec.swaps : [];
  const run = deps.runCmd || runCommand;
  const local = deps.localConfig || localConfig(deps.env || process.env);
  if (tier === 'free' && swaps.length) {
    throw fail('the free tier does not do visual swaps (choose economy or pro)', 'tier_unsupported', false);
  }
  const needsSwap = tier === 'economy' && swaps.length > 0;
  const needsDub = Boolean(spec.dub);
  if (!needsSwap && !needsDub) throw fail('nothing to render for this tier', 'nothing_to_render', false);
  if (needsDub && !spec.captions?.text) throw fail('captions.text is required for a local dub', 'render_failed', false);
  if (needsDub) assertLocalReady(local);
  if (needsSwap) {
    assertGeminiReady(deps.gemini || {});
    if (swaps.filter((s) => s.referenceUrl).length > 2) {
      throw fail('Gemini video edit takes at most two reference images', 'swap_failed', false);
    }
  }

  const sourceBytes = await downloadRunway(spec.source.url, deps.fetchImpl, signal);
  if (!sourceBytes?.length) throw fail('source video was empty', 'render_failed', false);
  let video = path.join(workDir, 'source.mp4');
  fs.writeFileSync(video, sourceBytes);
  const timings = {};

  if (needsSwap) {
    const started = Date.now();
    const seconds = await probeSeconds({ config: local, file: video, run, signal });
    const lengths = geminiSegments(Math.min(seconds, job.seconds + 1));
    if (!lengths.length) throw fail('source is shorter than the 3 s Gemini minimum', 'duration_unsupported', false);
    const prompt = swaps.length === 1
      ? swapPrompt(swaps[0])
      : `Apply all of these edits. Keep everything else exactly as it is.\n${swaps.map((s, i) => `${i + 1}. ${swapPrompt(s)}`).join('\n')}`;
    const images = [];
    for (const [i, swap] of swaps.filter((x) => x.referenceUrl).entries()) {
      const bytes = await downloadRunway(swap.referenceUrl, deps.fetchImpl, signal);
      const mime = /\.png($|\?)/i.test(swap.referenceUrl) ? 'image/png' : 'image/jpeg';
      const uri = await uploadToGcs({ config: deps.gemini, objectName: `lines-localize/${job.id}/ref-${i}${mime === 'image/png' ? '.png' : '.jpg'}`, bytes, mime, fetchImpl: deps.fetchImpl, signal });
      images.push({ uri, mime });
    }
    const pieces = await splitVideo({ config: local, file: video, lengths, outBase: path.join(workDir, 'seg'), run, signal });
    const edited = [];
    for (let i = 0; i < pieces.length; i += 1) {
      const gcsUri = await uploadToGcs({
        config: deps.gemini,
        objectName: `lines-localize/${job.id}/seg-${i}.mp4`,
        bytes: fs.readFileSync(pieces[i]),
        fetchImpl: deps.fetchImpl,
        signal,
      });
      const result = await runGeminiEdit({
        config: deps.gemini,
        prompt,
        gcsUri,
        images,
        fetchImpl: deps.fetchImpl,
        sleep: deps.sleep,
        signal,
        pollMs: deps.geminiPollMs || 10_000,
        heartbeat: () => deps.client.heartbeat(job.id),
        deadlineAt: job.deadlineAt,
        now: deps.now,
      });
      const out = path.join(workDir, `edited-${i}.mp4`);
      fs.writeFileSync(out, result.bytes);
      edited.push(out);
    }
    video = await concatVideos({ config: local, files: edited, out: path.join(workDir, 'swapped.mp4'), listFile: path.join(workDir, 'concat.txt'), run, signal });
    timings.swapMs = Date.now() - started;
  }

  if (needsDub) {
    let started = Date.now();
    const voice = await synthesizeSaudi({ config: local, text: spec.captions.text, outBase: path.join(workDir, 'voice'), run, signal });
    timings.ttsMs = Date.now() - started;
    const [voiceSec, videoSec] = [
      await probeSeconds({ config: local, file: voice, run, signal }),
      await probeSeconds({ config: local, file: video, run, signal }),
    ];
    if (voiceSec > videoSec + DUB_OVERRUN_SECONDS) {
      throw fail(`the Saudi line runs ${voiceSec.toFixed(1)} s but the video is ${videoSec.toFixed(1)} s; shorten captions.text`, 'script_too_long', false);
    }
    started = Date.now();
    video = await lipSync({ config: local, video, audio: voice, out: path.join(workDir, 'lipsync.mp4'), run, signal });
    timings.lipsyncMs = Date.now() - started;
  }

  const finalPath = path.join(workDir, 'localize.mp4');
  if (video !== finalPath) fs.copyFileSync(video, finalPath);
  if (fs.statSync(finalPath).size < 1000) throw fail('local render produced no video', 'render_failed', false);
  await deps.client.upload(job.id, finalPath, null);
  await deps.client.complete(job.id);
  return { status: 'succeeded', cost, tier, timings };
}

/**
 * Claimed `localize` job -> MP4 (tier `pro`, the default; free and economy go to renderLocalTier):
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
    const tier = spec.tier || 'pro';
    if (tier === 'free' || tier === 'economy') {
      if (!cost.withinCap) {
        throw fail(
          cost.durationSupported
            ? `estimated cost $${cost.estimateUsd.toFixed(2)} exceeds the per-job cap of $${cost.capUsd.toFixed(2)} or the tier does not take these swaps`
            : `Gemini video edit needs at least 3 seconds per clip (up to ${GEMINI_EDIT_MAX_SECONDS} s); this job is ${job.seconds}s`,
          cost.durationSupported ? (cost.swapsSupported ? 'cost_cap_exceeded' : 'tier_unsupported') : 'duration_unsupported',
          false,
        );
      }
      return await renderLocalTier(job, deps, { workDir, signal, cost });
    }
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
