'use client';

import { useState } from 'react';
import Link from 'next/link';
import Preview from './Preview';
import { categories, designs } from '../lib/designs';
import { t } from '../lib/dict';

export default function GalleryGrid({ lang }) {
  const d = t(lang);
  const [cat, setCat] = useState('all');
  const shown = designs.filter((x) => cat === 'all' || x.cat === cat);
  const catLabel = (id) => categories.find((c) => c.id === id)?.[lang];

  return (
    <>
      <div className="chips" role="group" aria-label={d.gallery.filter}>
        {categories.map((c) => (
          <button key={c.id} type="button" className="chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            {c[lang]}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--muted)' }} aria-live="polite">{d.gallery.count(shown.length)}</p>
      <div className="gallery-grid">
        {shown.map((x) => (
          <article key={x.id} className="dcard">
            <Preview c={x.c} />
            <div className="dcard-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <h2>{x.name[lang]}</h2>
                <span className="cat">{catLabel(x.cat)}</span>
              </div>
              <p>{x.desc[lang]}</p>
              <Link className="btn btn-lime" href={`/${lang}/order/?design=${x.id}`}>{d.gallery.pick}</Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
