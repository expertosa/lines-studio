/**
 * UGC (selfie testimonial) videos. The UGC worker (services/ugc-worker) pulls
 * these jobs and calls the paid vendors (ElevenLabs TTS, fal.ai OmniHuman).
 * This process never calls a vendor. Listed only when LINES_ENABLE_UGC=1.
 */
export const ugcEngine = Object.freeze({
  id: 'ugc',
  mode: 'pull',
  configured: true,
  paidCalls: true,
  macRequired: false,
});
