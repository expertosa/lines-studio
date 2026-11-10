/**
 * Placeholder for a future generative vendor.
 *
 * To add one:
 * 1. Set `configured` true only when that vendor's credential is present.
 * 2. Implement `describe(job)` for a pull worker, or `submit(job)` if the
 *    vendor accepts an outbound create. Keep the call inside this file.
 * 3. Point a style at `engine: 'external'` in styles.js.
 *
 * This process must not call a vendor merely because the module is loaded.
 */
export const externalEngine = Object.freeze({
  id: 'external',
  mode: 'pull',
  configured: false,
  paidCalls: false,
  describe() {
    const error = new Error('External video engine is not configured.');
    error.code = 'external_engine_not_configured';
    throw error;
  },
});
