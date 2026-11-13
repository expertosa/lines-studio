'use client';

import { useState } from 'react';
import VideoCard from './VideoCard';
import { workCategories, works } from '../lib/work';
import { t } from '../lib/dict';
import { site } from '../lib/site';

export default function WorkGrid({ lang }) {
  const d = t(lang);
  const [cat, setCat] = useState('all');
  const shown = works.filter((item) => cat === 'all' || item.cat === cat);
  const catLabel = (id) => workCategories.find((item) => item.id === id)?.[lang];
  const wa = `https://wa.me/${site.whatsapp}`;
  const visitHint = lang === 'ar' ? '(يفتح في تبويب جديد)' : '(opens in a new tab)';

  return (
    <>
      <div className="chips" role="group" aria-label={d.work.filter}>
        {workCategories.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={cat === item.id} onClick={() => setCat(item.id)}>
            {item[lang]}
          </button>
        ))}
      </div>
      <p className="work-count" aria-live="polite">{d.work.count(shown.length)}</p>
      {shown.length === 0 && <p className="placeholder">{d.work.empty}</p>}
      <div className="vgrid">
        {shown.map((item, index) => (
          <VideoCard
            key={item.id}
            id={item.id}
            title={item.name[lang]}
            description={item.desc[lang]}
            category={catLabel(item.cat)}
            alt={item.alt[lang]}
            image={item.image}
            video={item.video}
            poster={item.poster}
            fit={item.video ? 'cover' : 'contain'}
            ctaHref={`${wa}?text=${encodeURIComponent(d.work.likeWa(item.name[lang]))}`}
            ctaLabel={d.work.like}
            visitHref={item.url}
            visitLabel={d.work.visit}
            visitHint={visitHint}
            soundOn={d.video.unmute}
            soundOff={d.video.mute}
            detailsLabel={d.work.details}
            place="work-card"
            heading="h2"
            eager={index === 0}
            priority={index === 0}
            defer={index > 1}
          />
        ))}
      </div>
    </>
  );
}
