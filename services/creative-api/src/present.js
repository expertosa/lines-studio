import { BILLING, PUBLISH } from './constants.js';

function iso(value) {
  return value == null ? null : new Date(value).toISOString();
}

export function presentArtifact(artifact, jobId) {
  if (artifact.classification !== 'rendered') return null;
  return {
    id: artifact.id,
    classification: 'rendered',
    role: artifact.role,
    mime: artifact.mime,
    byteSize: artifact.byteSize,
    sha256: artifact.sha256,
    width: artifact.width,
    height: artifact.height,
    durationMs: artifact.durationMs,
    expiresAt: iso(artifact.expiresAt),
    lumaStdev: Number(artifact.lumaStdev.toFixed(3)),
    uniformFrame: false,
    downloadPath: `/v1/creative-jobs/${jobId}/artifacts/${artifact.id}`,
  };
}

export function presentJob(job, artifacts) {
  return {
    id: job.id,
    tenantId: job.tenantId,
    customerId: job.customerId,
    kind: job.kind,
    status: job.status,
    brief: job.brief,
    provider: job.provider,
    generative: false,
    paidCalls: false,
    attempt: job.attempt,
    maxAttempts: job.maxAttempts,
    createdAt: iso(job.createdAt),
    updatedAt: iso(job.updatedAt),
    startedAt: iso(job.startedAt),
    finishedAt: iso(job.finishedAt),
    deadlineAt: iso(job.deadlineAt),
    heartbeatAt: iso(job.heartbeatAt),
    error: job.errorCode ? { code: job.errorCode, message: job.errorMessage } : null,
    billing: BILLING,
    publish: PUBLISH,
    artifacts: artifacts.map((artifact) => presentArtifact(artifact, job.id)).filter(Boolean),
  };
}
