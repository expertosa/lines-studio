import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeMessage } from './api.js';
import { downloadShowcaseImage } from './image-url.js';
import { runMoneyPrinter } from './mpt.js';
import { assertOnDataVolume, isInside, resolveVideoRef } from './paths.js';
import { renderShowcaseFile } from './showcase.js';

export function rendererFor(job) {
  if (job?.engine === 'showcase' || job?.style === 'showcase') return 'showcase';
  return 'moneyprinter';
}

function download(url, destination, fetchImpl) {
  return fetchImpl(url, { redirect: 'manual' }).then(async (response) => {
    if (response.status >= 300 && response.status < 400) {
      throw Object.assign(new Error('redirect refused'), { code: 'render_failed', retry: false });
    }
    if (!response.ok) {
      throw Object.assign(new Error('video download failed'), { code: 'render_failed', retry: true });
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destination, bytes);
  });
}

function grabThumbnail(ffmpeg, video, destination) {
  return new Promise((resolve) => {
    const child = spawn(ffmpeg, ['-y', '-ss', '0.5', '-i', video, '-frames:v', '1', destination], {
      stdio: 'ignore',
      env: {
        PATH: process.env.PATH || '/usr/bin:/bin',
        TMPDIR: path.dirname(destination),
        LANG: 'C.UTF-8',
      },
    });
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0 && fs.existsSync(destination)));
  });
}

export async function renderClaimedJob(job, deps) {
  const controller = new AbortController();
  const beat = setInterval(() => {
    deps.client.heartbeat(job.id).then((body) => {
      if (body?.cancelRequested) controller.abort();
    }).catch((error) => {
      if (error.status === 409) controller.abort();
    });
  }, deps.heartbeatMs || 30_000);
  const tmpDir = assertOnDataVolume(path.join(deps.workerRoot, 'tmp'));
  if (!isInside(deps.workerRoot, tmpDir)) throw new Error('tmp escaped the worker root');
  fs.mkdirSync(tmpDir, { recursive: true });
  const videoPath = path.join(tmpDir, `${job.id}.mp4`);
  const thumbPath = path.join(tmpDir, `${job.id}.jpg`);
  try {
    if (rendererFor(job) === 'showcase') {
      const imagePath = path.join(tmpDir, `${job.id}.image`);
      try {
        await downloadShowcaseImage(job.imageUrl, imagePath, {
          fetchImpl: deps.fetchImpl,
          lookup: deps.lookup,
          signal: controller.signal,
        });
        await renderShowcaseFile({
          ffmpeg: deps.ffmpeg || 'ffmpeg',
          imagePath,
          outputPath: videoPath,
          seconds: job.seconds,
          signal: controller.signal,
        });
      } finally {
        fs.rmSync(imagePath, { force: true });
      }
    } else {
      const task = await runMoneyPrinter(job, {
        baseUrl: deps.mptBaseUrl,
        fetchImpl: deps.fetchImpl,
        fontName: deps.fontName,
        sleep: deps.sleep,
        signal: controller.signal,
        pollMs: deps.pollMs,
        now: deps.now,
        heartbeat: () => deps.client.heartbeat(job.id),
      });
      const ref = task.videos?.[0] || task.combined_videos?.[0];
      const resolved = resolveVideoRef(ref, { mptBase: deps.mptBaseUrl, workerRoot: deps.workerRoot });
      if (resolved.kind === 'file') fs.copyFileSync(resolved.file, videoPath);
      else await download(resolved.url, videoPath, deps.fetchImpl);
    }
    const hasThumb = await grabThumbnail(deps.ffmpeg || 'ffmpeg', videoPath, thumbPath);
    await deps.client.upload(job.id, videoPath, hasThumb ? thumbPath : null);
    await deps.client.complete(job.id);
    return { status: 'succeeded' };
  } catch (error) {
    const code = error.code === 'cancelled' || controller.signal.aborted ? 'cancelled' : (error.code || 'render_failed');
    try {
      await deps.client.fail(job.id, {
        code,
        message: sanitizeMessage(error.message),
        retry: code !== 'cancelled' && error.retry !== false,
      });
    } catch (reportError) {
      deps.log?.('error', { code: 'fail_report', message: sanitizeMessage(reportError.message) });
    }
    return { status: 'failed', code };
  } finally {
    clearInterval(beat);
    fs.rmSync(videoPath, { force: true });
    fs.rmSync(thumbPath, { force: true });
  }
}
