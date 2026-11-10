import { DEFAULTS, HARD } from './constants.js';

function cap(value, hard, fallback, min = 1) {
  if (value == null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < min) {
    throw new Error('A limit is invalid.');
  }
  return Math.min(number, hard);
}

export function resolveLimits(input = {}) {
  const backoff = Array.isArray(input.webhookBackoffMs) && input.webhookBackoffMs.length > 0
    ? Object.freeze(input.webhookBackoffMs.map((item) => {
      const number = Number(item);
      if (!Number.isInteger(number) || number < 0) throw new Error('Webhook backoff is invalid.');
      return number;
    }))
    : DEFAULTS.webhookBackoffMs;
  return Object.freeze({
    jobsPerHour: cap(input.jobsPerHour, HARD.maxJobsPerHour, DEFAULTS.jobsPerHour),
    videoSecondsPerMonth: cap(input.videoSecondsPerMonth, HARD.maxVideoSecondsPerMonth, DEFAULTS.videoSecondsPerMonth),
    maxConcurrency: cap(input.maxConcurrency, HARD.maxConcurrency, DEFAULTS.maxConcurrency),
    deadlineMs: cap(input.deadlineMs, HARD.maxDeadlineMs, DEFAULTS.deadlineMs, 1000),
    artifactTtlMs: cap(input.artifactTtlMs, HARD.maxArtifactTtlMs, DEFAULTS.artifactTtlMs, 1000),
    leaseMs: cap(input.leaseMs, HARD.maxLeaseMs, DEFAULTS.leaseMs, 50),
    maxAttempts: cap(input.maxAttempts, HARD.maxAttempts, DEFAULTS.maxAttempts),
    webhookTimeoutMs: cap(input.webhookTimeoutMs, 60_000, DEFAULTS.webhookTimeoutMs, 50),
    webhookMaxAttempts: cap(input.webhookMaxAttempts, HARD.maxWebhookAttempts, DEFAULTS.webhookMaxAttempts),
    templateTimeoutMs: cap(input.templateTimeoutMs, 180_000, DEFAULTS.templateTimeoutMs, 200),
    signedUrlTtlMs: cap(input.signedUrlTtlMs, HARD.maxSignedUrlTtlMs, DEFAULTS.signedUrlTtlMs, 1000),
    webhookBackoffMs: backoff,
    maxBodyBytes: HARD.maxBodyBytes,
    maxVideoBytes: HARD.maxVideoBytes,
    maxThumbBytes: HARD.maxThumbBytes,
  });
}

export function monthStart(ms) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function nextMonth(ms) {
  const date = new Date(ms);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}
