'use client';

import { useState } from 'react';
import VideoCard from './VideoCard';
import { adCategories, sampleAds } from '../lib/sample-ads';
import { t } from '../lib/dict';
import { site } from '../lib/site';

export default function AdsGrid({ lang }) {
  const d = t(lang);
  const [cat, setCat] = useState('all');
  const shown = sampleAds.filter((item) => cat === 'all' || item.cat === cat);
  const wa = `https://wa.me/${site.whatsapp}`;

  return (
    <>
      <div className="chips" role="group" aria-label={d.ads.filter}>
        {adCategories.map((item) => (
          <button key={item.id} type="button" className="chip" aria-pressed={cat === item.id} onClick={() => setCat(item.id)}>
            {item[lang]}
          </button>
        ))}
      </div>
      <p className="work-count" aria-live="polite">{d.ads.count(shown.length)}</p>
      {shown.length === 0 && <p className="placeholder">{d.ads.empty}</p>}
      <div className="vgrid">
        {shown.map((item, index) => (
          <VideoCard
            key={item.id}
            id={item.id}
            title={item.brand[lang]}
            description={item.hook[lang]}
            note={item.caption[lang]}
            script={item.script[lang]}
            scriptLabel={d.ads.script}
            category={`${d.ads.sample} · ${adCategories.find((c) => c.id === item.cat)?.[lang]}`}
            alt={d.ads.alt(item.brand[lang], item.hook[lang])}
            poster={item.poster}
            video={item.video}
            fit="cover"
            ctaHref={`${wa}?text=${encodeURIComponent(d.ads.likeWa(item.brand[lang]))}`}
            ctaLabel={d.ads.like}
            soundOn={d.video.unmute}
            soundOff={d.video.mute}
            detailsLabel={d.ads.details}
            place="ad-card"
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
