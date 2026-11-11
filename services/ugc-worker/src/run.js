import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeMessage } from './api.js';
import { buildCaptions } from './captions.js';
import { synthesize } from './eleven.js';
import { dataUri, download, runOmnihuman } from './fal.js';
import { mimeFor } from './presenters.js';

function tool(bin, args, { workDir, signal, capture = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin', TMPDIR: workDir, LANG: 'C.UTF-8' },
      stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'],
      signal,
    });
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { err = (err + chunk).slice(-400); });
    child.on('error', (error) => reject(Object.assign(new Error(`${path.basename(bin)}: ${error.code || error.message}`), {
      code: signal?.aborted ? 'cancelled' : 'render_failed',
      retry: false,
    })));
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      // No automatic retry: a retry would pay for the voice and the lip sync again.
      else reject(Object.assign(new Error(`${path.basename(bin)} exited ${code}: ${err}`), { code: 'render_failed', retry: false }));
    });
  });
}

export async function audioSeconds(ffprobe, file, workDir) {
  const out = await tool(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { workDir, capture: true });
  const value = Number(String(out).trim());
  if (!Number.isFinite(value) || value <= 0) throw Object.assign(new Error('could not read audio length'), { code: 'tts_failed', retry: true });
  return value;
}

/**
 * Claimed `ugc` job -> MP4:
 * 1. presenter from metadata.presenter (photo + ElevenLabs voice)
 * 2. ElevenLabs reads script.text in that voice
 * 3. fal.ai OmniHuman animates the photo with lip sync
 * 4. ffmpeg burns captions (metadata.captions = "off" to skip) and grabs a thumbnail
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
  const ffmpeg = deps.ffmpeg || 'ffmpeg';
  const ffprobe = deps.ffprobe || 'ffprobe';
  const signal = controller.signal;
  try {
    if (job.engine !== 'ugc') throw Object.assign(new Error('this worker only renders ugc jobs'), { code: 'render_failed', retry: false });
    const text = job.script?.text?.trim();
    if (!text) throw Object.assign(new Error('script.text is required for ugc'), { code: 'script_required', retry: false });
    const meta = job.metadata || {};
    const presenter = deps.presenters.pick(meta.presenter, job.language);

    const voice = await synthesize({
      apiKey: deps.elevenKey,
      voiceId: presenter.voiceId,
      text,
      modelId: deps.ttsModel,
      language: deps.sendLanguage ? job.language : undefined,
      fetchImpl: deps.fetchImpl,
      signal,
    });
    const voicePath = path.join(workDir, 'voice.mp3');
    fs.writeFileSync(voicePath, voice);
    const seconds = await audioSeconds(ffprobe, voicePath, workDir);
    if (seconds > job.seconds + 0.5) {
      throw Object.assign(new Error(`script reads in ${seconds.toFixed(1)}s, longer than the ${job.seconds}s job`), {
        code: 'script_too_long',
        retry: false,
      });
    }

    const videoUrl = await runOmnihuman({
      apiKey: deps.falKey,
      imageUrl: dataUri(mimeFor(presenter.image), fs.readFileSync(presenter.image)),
      audioUrl: dataUri('audio/mpeg', voice),
      prompt: presenter.prompt,
      resolution: deps.resolution || '1080p',
      fetchImpl: deps.fetchImpl,
      sleep: deps.sleep,
      signal,
      pollMs: deps.pollMs,
      heartbeat: () => deps.client.heartbeat(job.id),
      deadlineAt: job.deadlineAt,
      now: deps.now,
    });
    const rawPath = path.join(workDir, 'raw.mp4');
    fs.writeFileSync(rawPath, await download(videoUrl, deps.fetchImpl, signal));

    const finalPath = path.join(workDir, 'ugc.mp4');
    if (meta.captions === 'off') {
      fs.copyFileSync(rawPath, finalPath);
    } else {
      const assPath = path.join(workDir, 'captions.ass');
      fs.writeFileSync(assPath, buildCaptions(text, {
        duration: seconds,
        width: job.width || 1080,
        height: job.height || 1920,
        language: job.language,
        font: deps.fonts?.[job.language],
      }));
      const esc = (p) => p.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
      await tool(ffmpeg, [
        '-y', '-hide_banner', '-loglevel', 'error', '-i', rawPath,
        '-vf', `scale=${job.width || 1080}:${job.height || 1920}:force_original_aspect_ratio=increase,crop=${job.width || 1080}:${job.height || 1920},ass=${esc(assPath)}${deps.fontsDir ? `:fontsdir=${esc(deps.fontsDir)}` : ''},format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', finalPath,
      ], { workDir, signal });
    }
    const thumbPath = path.join(workDir, 'ugc.jpg');
    const thumb = await tool(ffmpeg, ['-y', '-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', finalPath, '-frames:v', '1', '-q:v', '3', thumbPath], { workDir, signal })
      .then(() => fs.existsSync(thumbPath)).catch(() => false);
    await deps.client.upload(job.id, finalPath, thumb ? thumbPath : null);
    await deps.client.complete(job.id);
    return { status: 'succeeded', seconds };
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
