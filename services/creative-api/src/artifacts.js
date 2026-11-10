import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CodedError } from './errors.js';
import { safeJoin } from './paths.js';
import { inspectTemplateVideo, inspectThumbnail, inspectUploadedVideo } from './render/inspect.js';

export function hashFile(filePath) {
  const hash = createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function extension(mime) {
  if (mime === 'video/mp4') return 'mp4';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/jpeg') return 'jpg';
  throw new CodedError('ARTIFACT_REJECTED', 'unsupported mime');
}

export async function storeFile(ctx, job, owner, sourcePath, { role, mime, template = false }) {
  const id = randomUUID();
  const relative = `artifacts/${job.id}/${id}.${extension(mime)}`;
  const destination = safeJoin(ctx.dataDir, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  let meta;
  if (role === 'video' && template) {
    meta = await inspectTemplateVideo({
      filePath: sourcePath,
      ffmpeg: ctx.ffmpeg,
      ffprobe: ctx.ffprobe,
      width: job.width,
      height: job.height,
      durationMs: job.seconds * 1000,
    });
  } else if (role === 'video') {
    meta = await inspectUploadedVideo({ filePath: sourcePath, ffprobe: ctx.ffprobe });
  } else {
    meta = inspectThumbnail(sourcePath, mime);
  }
  const sha256 = hashFile(sourcePath);
  fs.renameSync(sourcePath, destination);
  const saved = ctx.store.insertArtifact(job.id, owner, {
    id,
    role,
    mime,
    byteSize: meta.byteSize,
    sha256,
    width: meta.width ?? null,
    height: meta.height ?? null,
    durationMs: meta.durationMs ?? null,
    relativePath: relative,
  });
  if (!saved.artifact) {
    fs.rmSync(destination, { force: true });
    return saved;
  }
  return saved;
}
