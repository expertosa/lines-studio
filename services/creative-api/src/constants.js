/** Hard ceilings. Environment values may only lower a limit. */
export const HARD = Object.freeze({
  maxJobsPerHour: 20,
  maxRunningGlobal: 2,
  maxRunningPerTenant: 1,
  maxDurationMs: 10_000,
  minDurationMs: 2_000,
  maxArtifactBytes: 20 * 1024 * 1024,
  minVideoBytes: 2_000,
  minImageBytes: 800,
  maxArtifactTtlMs: 30 * 24 * 60 * 60 * 1000,
  defaultArtifactTtlMs: 7 * 24 * 60 * 60 * 1000,
  maxDeadlineMs: 10 * 60 * 1000,
  defaultDeadlineMs: 3 * 60 * 1000,
  maxTimeoutMs: 45_000,
  maxAttempts: 2,
  maxBodyBytes: 8_192,
  minLumaStdev: 8,
  presets: Object.freeze([
    [1080, 1920],
    [1920, 1080],
    [1080, 1080],
    [720, 1280],
    [1280, 720],
    [640, 360],
  ]),
});

export const BILLING = Object.freeze({
  payer: 'experto',
  includedInServicePrice: true,
  extraGenerationFee: false,
  creditDeduction: false,
  paidProviderRequest: false,
});

export const PUBLISH = Object.freeze({
  performed: false,
  supported: false,
  requiresAdminReview: true,
  accountSource: 'client-owned-via-gateway',
});

export const SCOPES = Object.freeze([
  'jobs:write',
  'jobs:read',
  'jobs:cancel',
  'artifacts:read',
]);

export const ALLOWED_PROVIDERS = Object.freeze(['local-ffmpeg', 'disabled']);
