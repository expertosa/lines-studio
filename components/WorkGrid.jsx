'use client';

import { useState } from 'react';
import { workCategories, works } from '../lib/work';
import { t } from '../lib/dict';

export default function WorkGrid({ lang }) {
  const d = t(lang);
  const [cat, setCat] = useState('all');
  const shown = works.filter((item) => cat === 'all' || item.cat === cat);
  const catLabel = (id) => workCategories.find((item) => item.id === id)?.[lang];

  return (
    <>
      <div className="chips" role="group" aria-label={d.work.filter}>
        {workCategories.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={cat === item.id} onClick={() => setCat(item.id)}>
            {item[lang]}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--muted)' }} aria-live="polite">{d.work.count(shown.length)}</p>
      {shown.length === 0 && <p className="placeholder">{d.work.empty}</p>}
      <div className="work-grid">
        {shown.map((item) => (
          <article key={item.id} id={item.id} className="wcard">
            <img src={item.image} alt={item.alt[lang]} width={800} height={500} loading="lazy" decoding="async" />
            <div className="wcard-body">
              <div className="wcard-head">
                <h2>{item.name[lang]}</h2>
                <span className="cat">{catLabel(item.cat)}</span>
              </div>
              <p>{item.desc[lang]}</p>
              <a className="btn btn-lime" href={item.url} target="_blank" rel="noopener noreferrer">
                {d.work.visit}
                <span className="sr">{lang === 'ar' ? '(يفتح في تبويب جديد)' : '(opens in a new tab)'}</span>
              </a>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
