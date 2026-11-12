'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import LangSwitch from './LangSwitch';
import { t } from '../lib/dict';
import { site } from '../lib/site';
import { socialCopy } from '../lib/social';

export default function SiteNav({ lang, path = '' }) {
  const d = t(lang);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [lang, path]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        className="nav-toggle"
        aria-expanded={open}
        aria-controls="site-nav"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="sr">{open ? d.nav.close : d.nav.menu}</span>
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M4 4 L16 16 M16 4 L4 16" stroke="currentColor" strokeWidth="2" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
            <path d="M3 5 H17 M3 10 H17 M3 15 H17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <nav id="site-nav" className={open ? 'nav is-open' : 'nav'} aria-label={lang === 'ar' ? 'القائمة الرئيسية' : 'Main menu'}>
        <Link href={`/${lang}/gallery/`} onClick={close}>{d.nav.gallery}</Link>
        <Link href={`/${lang}/work/`} onClick={close}>{d.nav.work}</Link>
        <Link href={`/${lang}/#packages`} onClick={close}>{d.nav.packages}</Link>
        <Link href={`/${lang}/#video`} onClick={close}>{d.nav.video}</Link>
        <Link href={`/${lang}/social/`} onClick={close}>{(socialCopy[lang] || socialCopy.ar).nav}</Link>
        <Link href={`/${lang}/#how`} onClick={close}>{d.nav.how}</Link>
        <Link href={`/${lang}/mcp/`} onClick={close}>{d.nav.mcp}</Link>
        <LangSwitch lang={lang} path={path} label={d.nav.lang} onClick={close} />
        <a className="btn btn-white" href={`https://wa.me/${site.whatsapp}`} data-umami-event="whatsapp" data-umami-event-place="header" onClick={close}>{d.nav.talk}</a>
      </nav>
    </>
  );
}
