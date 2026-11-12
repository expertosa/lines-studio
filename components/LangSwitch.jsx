'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { other } from '../lib/site';

export default function LangSwitch({ lang, path = '', label, onClick }) {
  const base = `/${other(lang)}/${path}`;
  const [href, setHref] = useState(base);
  const liveHref = () => `${base}${window.location.search}`;

  useEffect(() => {
    setHref(liveHref());
  }, [base]);

  return (
    <Link
      href={href}
      hrefLang={other(lang)}
      onClick={(event) => {
        onClick?.();
        const next = liveHref();
        if (next === href || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
        event.preventDefault();
        window.location.assign(next);
      }}
    >
      {label}
    </Link>
  );
}
