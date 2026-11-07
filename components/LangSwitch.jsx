'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { other } from '../lib/site';

export default function LangSwitch({ lang, path = '', label }) {
  const base = `/${other(lang)}/${path}`;
  const [href, setHref] = useState(base);

  useEffect(() => {
    setHref(`${base}${window.location.search}`);
  }, [base]);

  return (
    <Link href={href} hrefLang={other(lang)}>
      {label}
    </Link>
  );
}
