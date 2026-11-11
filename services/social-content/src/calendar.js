/**
 * Lay out the month before any writing: which day, which platform, which format.
 * Deterministic, so the plan the client approves is the plan the writer fills.
 */

/** Fixed Gregorian national days. Moving occasions (Ramadan, Eid) come from the brief. */
export const NATIONAL_DAYS = Object.freeze([
  Object.freeze({ month: 2, day: 22, name: 'يوم التأسيس' }),
  Object.freeze({ month: 9, day: 23, name: 'اليوم الوطني' }),
]);

/** Content pillars rotated through the month so the feed is not all offers. */
export const PILLARS = Object.freeze(['value', 'product', 'proof', 'behind', 'engage', 'offer']);

/** Best-fit formats per platform for posts (reels and stories are planned separately). */
const POST_FORMAT = Object.freeze({
  instagram: 'carousel',
  tiktok: 'video',
  snapchat: 'snap',
  x: 'tweet',
  linkedin: 'post',
});
const REEL_PLATFORMS = Object.freeze(['instagram', 'tiktok', 'snapchat']);

function daysIn(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function iso(month, day) {
  return `${month}-${String(day).padStart(2, '0')}`;
}

/** Spread n items over the month, as evenly as possible, never two on one day when avoidable. */
export function spread(n, days) {
  if (n <= 0) return [];
  const step = days / n;
  return Array.from({ length: n }, (_, i) => Math.min(days, Math.floor(i * step + step / 2) + 1));
}

export function buildCalendar(brief) {
  const days = daysIn(brief.month);
  const monthNo = Number(brief.month.slice(5));
  const occasions = [
    ...NATIONAL_DAYS.filter((d) => d.month === monthNo).map((d) => ({ date: iso(brief.month, d.day), name: d.name })),
    ...brief.occasions.filter((o) => o.date.startsWith(brief.month)),
  ];
  const slots = [];
  spread(brief.volume.posts, days).forEach((day, i) => {
    const platform = brief.platforms[i % brief.platforms.length];
    slots.push({ date: iso(brief.month, day), platform, kind: 'post', format: POST_FORMAT[platform], pillar: PILLARS[i % PILLARS.length] });
  });
  const reelPlatforms = brief.platforms.filter((p) => REEL_PLATFORMS.includes(p));
  if (reelPlatforms.length) {
    spread(brief.volume.reels, days).forEach((day, i) => {
      slots.push({ date: iso(brief.month, day), platform: reelPlatforms[i % reelPlatforms.length], kind: 'reel', format: 'reel', pillar: PILLARS[(i + 2) % PILLARS.length] });
    });
  }
  const storyPlatform = brief.platforms.find((p) => p === 'instagram' || p === 'snapchat');
  if (storyPlatform && brief.volume.storiesPerWeek > 0) {
    const stories = Math.round((brief.volume.storiesPerWeek * days) / 7);
    spread(stories, days).forEach((day, i) => {
      slots.push({ date: iso(brief.month, day), platform: storyPlatform, kind: 'story', format: 'story', pillar: PILLARS[(i + 4) % PILLARS.length] });
    });
  }
  for (const occasion of occasions) {
    const slot = slots.find((s) => s.date === occasion.date && s.kind === 'post')
      || slots.filter((s) => s.kind === 'post').sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(occasion.date)) - Math.abs(Date.parse(b.date) - Date.parse(occasion.date)))[0];
    if (slot) {
      slot.date = occasion.date;
      slot.occasion = occasion.name;
      slot.pillar = 'occasion';
    }
  }
  slots.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return slots.map((slot, i) => ({ id: `s${String(i + 1).padStart(2, '0')}`, ...slot }));
}
