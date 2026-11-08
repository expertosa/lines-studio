import { HARD } from './constants.js';

function cap(value, hard, fallback, min = 1) {
  if (value == null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(number) || number < min) {
    throw new Error('A generation limit is invalid.');
  }
  return Math.min(number, hard);
}

export function resolveLimits(input = {}) {
  return Object.freeze({
    maxJobsPerHour: cap(input.maxJobsPerHour, HARD.maxJobsPerHour, HARD.maxJobsPerHour),
    maxRunningGlobal: cap(input.maxRunningGlobal, HARD.maxRunningGlobal, 1),
    maxRunningPerTenant: cap(input.maxRunningPerTenant, HARD.maxRunningPerTenant, 1),
    deadlineMs: cap(input.deadlineMs, HARD.maxDeadlineMs, HARD.defaultDeadlineMs, 0),
    artifactTtlMs: cap(input.artifactTtlMs, HARD.maxArtifactTtlMs, HARD.defaultArtifactTtlMs, 1000),
    maxAttempts: HARD.maxAttempts,
    maxBodyBytes: HARD.maxBodyBytes,
  });
}
