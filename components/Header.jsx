import Link from 'next/link';
import { t } from '../lib/dict';
import { other, site } from '../lib/site';

export default function Header({ lang, path = '' }) {
  const d = t(lang);
  return (
    <div className="dark">
      <header className="wrap header">
        <Link href={`/${lang}/`} className="logo">
          <span className="logo-mark" aria-hidden="true">{lang === 'ar' ? 'أ' : 'A'}</span>
          <span className="logo-name">{d.brand}</span>
        </Link>
        <nav className="nav" aria-label={lang === 'ar' ? 'القائمة الرئيسية' : 'Main menu'}>
          <Link href={`/${lang}/gallery/`}>{d.nav.gallery}</Link>
          <Link href={`/${lang}/#packages`}>{d.nav.packages}</Link>
          <Link href={`/${lang}/#how`}>{d.nav.how}</Link>
          <Link href={`/${other(lang)}/${path}`} hrefLang={other(lang)}>{d.nav.lang}</Link>
          <a className="btn btn-white" href={`https://wa.me/${site.whatsapp}`}>{d.nav.talk}</a>
        </nav>
      </header>
    </div>
  );
}
