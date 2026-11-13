/**
 * Screenshot showcase. The Mac video worker pulls these jobs and encodes
 * them with local ffmpeg (Ken Burns over the still, no Pixabay, no TTS).
 * This process never downloads the image and never opens a connection to the Mac.
 */
export const showcaseEngine = Object.freeze({
  id: 'showcase',
  mode: 'pull',
  configured: true,
  paidCalls: false,
  macRequired: true,
});
