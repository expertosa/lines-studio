/**
 * Procedural 3D promos. Blender runs on the owner's Mac and pulls jobs
 * (services/blender-3d-promo). This process never opens a connection to it.
 * Listed only when LINES_ENABLE_BLENDER=1, so jobs never queue with no worker.
 */
export const blenderEngine = Object.freeze({
  id: 'blender',
  mode: 'pull',
  configured: true,
  paidCalls: false,
  macRequired: true,
});
