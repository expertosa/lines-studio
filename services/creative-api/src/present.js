import { signedArtifactPath } from './sign.js';

function iso(ms) {
  return new Date(ms).toISOString();
}

function presentArtifact(artifact, jobId, signing) {
  const body = {
    id: artifact.id,
    role: artifact.role,
    mime: artifact.mime,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    width: artifact.width,
    height: artifact.height,
    durationMs: artifact.durationMs,
    expiresAt: iso(artifact.expiresAt),
    downloadPath: `/v1/jobs/${jobId}/artifacts/${artifact.id}`,
  };
  if (signing?.key) {
    const exp = Math.floor((signing.now + signing.ttlMs) / 1000);
    body.signedUrl = signedArtifactPath(signing.key, jobId, artifact.id, exp);
  }
  return body;
}

export function presentJob(job, artifacts, { summary = false, signing = null, now = Date.now() } = {}) {
  const visible = (artifacts || []).filter((artifact) => artifact.expiresAt > now);
  const body = {
    id: job.id,
    reference: job.reference,
    title: job.title,
    status: job.status,
    style: job.style,
    format: job.format,
    language: job.language,
    seconds: job.seconds,
    voice: job.voice,
    engine: job.engine,
    endUserId: job.endUserId,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
    startedAt: job.startedAt == null ? null : iso(job.startedAt),
    finishedAt: job.finishedAt == null ? null : iso(job.finishedAt),
    deadlineAt: iso(job.deadlineAt),
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    artifacts: visible.map((artifact) => presentArtifact(artifact, job.id, signing ? { ...signing, now } : null)),
  };
  if (!summary) {
    body.prompt = job.prompt;
    body.script = job.script;
    body.metadata = job.metadata;
    body.callbackUrl = job.callbackUrl;
  }
  return body;
}

export function presentWorkerJob(job) {
  return {
    id: job.id,
    reference: job.reference,
    title: job.title,
    prompt: job.prompt,
    script: job.script,
    style: job.style,
    format: job.format,
    language: job.language,
    seconds: job.seconds,
    voice: job.voice,
    // Render options for the worker (promo3d palette/hero, ugc presenter). Callers are told not to put secrets here.
    metadata: job.metadata || {},
    engine: job.engine,
    width: job.width,
    height: job.height,
    attempt: job.attempt,
    deadlineAt: iso(job.deadlineAt),
  };
}
