// Bump when a video file must bypass Cloudflare. Cached mp4s stay for 30 days
// and the API token cannot purge them. Posters are left unversioned.
export const VIDEO_VERSION = '2';

export function videoUrl(path) {
  return `${path}?v=${VIDEO_VERSION}`;
}
