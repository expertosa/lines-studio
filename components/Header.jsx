import Link from 'next/link';
import LangSwitch from './LangSwitch';
import { t } from '../lib/dict';
import { site } from '../lib/site';

export default function Header({ lang, path = '' }) {
  const d = t(lang);
  return (
    <div className="dark">
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
        <nav className="nav" aria-label={lang === 'ar' ? 'القائمة الرئيسية' : 'Main menu'}>
          <Link href={`/${lang}/gallery/`}>{d.nav.gallery}</Link>
          <Link href={`/${lang}/work/`}>{d.nav.work}</Link>
          <Link href={`/${lang}/#packages`}>{d.nav.packages}</Link>
          <Link href={`/${lang}/#how`}>{d.nav.how}</Link>
          <LangSwitch lang={lang} path={path} label={d.nav.lang} />
          <a className="btn btn-white" href={`https://wa.me/${site.whatsapp}`}>{d.nav.talk}</a>
        </nav>
      </header>
    </div>
  );
}
