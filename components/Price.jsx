import { launchOffer, launchPrice, offerActive } from '../lib/promo';

export const fmt = (n) => n.toLocaleString('en-US');

/** A listed price with the launch offer applied: the old price struck through, then today's price. */
export default function Price({ amount, plus = false, now }) {
  const today = launchPrice(amount, now);
  const suffix = plus ? '+' : '';
  if (!offerActive(now) || today === amount) return <bdi dir="ltr">{fmt(amount)}{suffix}</bdi>;
  return (
    <>
      <s className="was" aria-label={`${fmt(amount)}`}>{fmt(amount)}</s>{' '}
      <bdi dir="ltr" className="now-wrap"><span className="now">{fmt(today)}{suffix}</span></bdi>
    </>
  );
}

/** Formatter for prices inside sentences (notes, FAQ): today's price only. */
export const todayFmt = (amount) => fmt(launchPrice(amount));

export function offerBadge(lang) {
  if (!offerActive()) return null;
  return `${launchOffer.label[lang] || launchOffer.label.ar} ${launchOffer.pct}%`;
}
