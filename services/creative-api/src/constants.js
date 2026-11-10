/** Hard ceilings. Environment values may only lower a limit, except where noted. */
export const HARD = Object.freeze({
  maxJobsPerHour: 1000,
  maxVideoSecondsPerMonth: 500_000,
  maxConcurrency: 8,
  maxDeadlineMs: 24 * 60 * 60 * 1000,
  maxArtifactTtlMs: 90 * 24 * 60 * 60 * 1000,
  maxLeaseMs: 15 * 60 * 1000,
  maxAttempts: 5,
  maxBodyBytes: 32 * 1024,
  maxVideoBytes: 200 * 1024 * 1024,
  maxThumbBytes: 5 * 1024 * 1024,
  minVideoBytes: 1500,
  minThumbBytes: 40,
  minLumaStdev: 8,
  maxSignedUrlTtlMs: 60 * 60 * 1000,
  maxWebhookAttempts: 10,
});

export const DEFAULTS = Object.freeze({
  jobsPerHour: 20,
  videoSecondsPerMonth: 36_000,
  maxConcurrency: 1,
  deadlineMs: 2 * 60 * 60 * 1000,
  artifactTtlMs: 14 * 24 * 60 * 60 * 1000,
  leaseMs: 120_000,
  maxAttempts: 2,
  webhookTimeoutMs: 8_000,
  webhookMaxAttempts: 8,
  templateTimeoutMs: 90_000,
  signedUrlTtlMs: 15 * 60 * 1000,
  webhookBackoffMs: Object.freeze([5_000, 15_000, 45_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000]),
});

export const APP_SCOPES = Object.freeze([
  'jobs:write',
  'jobs:read',
  'jobs:cancel',
  'artifacts:read',
  'usage:read',
]);

export const WORKER_SCOPE = 'worker:run';

export const JOB_STATUSES = Object.freeze(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export const FORMATS = Object.freeze(['9:16', '16:9', '1:1']);
export const LANGUAGES = Object.freeze(['ar', 'en']);
export const SECONDS = Object.freeze([15, 30, 60]);

/** Nominal pixels for the MoneyPrinterTurbo engine (1080p). */
export const NOMINAL_SIZE = Object.freeze({
  '9:16': Object.freeze({ width: 1080, height: 1920 }),
  '16:9': Object.freeze({ width: 1920, height: 1080 }),
  '1:1': Object.freeze({ width: 1080, height: 1080 }),
});

/** Small frame the built-in template engine actually encodes. */
export const TEMPLATE_SIZE = Object.freeze({
  '9:16': Object.freeze({ width: 360, height: 640 }),
  '16:9': Object.freeze({ width: 640, height: 360 }),
  '1:1': Object.freeze({ width: 360, height: 360 }),
});

export const BUILTIN_WORKER_ID = 'builtin:template';
