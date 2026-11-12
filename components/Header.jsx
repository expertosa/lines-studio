import Link from 'next/link';
import SiteNav from './SiteNav';
import { t } from '../lib/dict';
import { launchOffer, offerActive } from '../lib/promo';

export default function Header({ lang, path = '' }) {
  const d = t(lang);
  const ar = lang === 'ar';
  return (
    <div className="dark">
      {offerActive() && (
        <p className="offer-bar">
          {ar
            ? `${launchOffer.label.ar}: ${launchOffer.pct}% على كل الباقات. وعندك كود خصم؟ أضفه وقت الطلب.`
            : `${launchOffer.label.en}: ${launchOffer.pct}% off every plan. Have a promo code? Add it when you order.`}
        </p>
      )}
      <header className="wrap header">
        <Link href={`/${lang}/`} className="logo">
          <span className="logo-mark" aria-hidden="true">
            <svg width="24" height="20" viewBox="0 0 24 20" style={{ transform: lang === 'ar' ? 'none' : 'scaleX(-1)' }}>
              <rect x="0" y="0" width="24" height="4" rx="2" fill="#111" />
              <rect x="6" y="8" width="18" height="4" rx="2" fill="#111" />
              <rect x="12" y="16" width="12" height="4" rx="2" fill="#111" />
            </svg>
          </span>
          <span className="logo-name">{d.brand}</span>
        </Link>
        <SiteNav lang={lang} path={path} />
      </header>
    </div>
  );
}
