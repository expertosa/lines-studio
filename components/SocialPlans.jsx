'use client';

import { useState } from 'react';
import Price, { fmt } from './Price';
import PromoCode from './PromoCode';
import { site } from '../lib/site';
import { socialCopy, socialPackages } from '../lib/social';
import { launchOffer, launchPrice, offerActive, promoText, withCode } from '../lib/promo';

const COLORS = ['var(--lime)', 'var(--lilac)', 'var(--coral)', '#fff'];

export default function SocialPlans({ lang }) {
  const c = socialCopy[lang] || socialCopy.ar;
  const p = promoText[lang] || promoText.ar;
  const [promo, setPromo] = useState(null);

  const order = (plan, total) => {
    const lines = [
      c.waIntro,
      `• ${plan.name[lang]} — ${fmt(plan.price)} ${c.month}`,
      offerActive() && `• ${p.launch(launchOffer.pct)} (${p.months(launchOffer.subscriptionMonths)}): ${fmt(launchPrice(plan.price))} ${c.month}`,
      promo && `• ${p.codeLine(promo.code, promo.pct)}`,
      (offerActive() || promo) && `• ${lang === 'ar' ? 'الإجمالي' : 'Total'}: ${fmt(total)} ${c.month}`,
    ].filter(Boolean).join('\n');
    return `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(lines)}`;
  };

  return (
    <>
      <div className="social-promo">
        {offerActive() && <p className="offer-note"><b>{p.launch(launchOffer.pct)}</b> · {p.months(launchOffer.subscriptionMonths)}</p>}
        <PromoCode lang={lang} scope="social" value={promo} onChange={setPromo} />
      </div>
      <div className="social-plans">
        {socialPackages.map((plan, i) => {
          const total = withCode(launchPrice(plan.price), promo?.pct);
          return (
            <div key={plan.id} className={`social-plan${plan.featured ? ' social-plan-featured' : ''}`}>
              <span className="tag" style={{ background: COLORS[i], color: 'var(--ink)' }}>{plan.tag[lang]}</span>
              <h3>{plan.name[lang]}</h3>
              <div className="price">
                {promo ? <><s className="was">{fmt(plan.price)}</s> <span className="now">{fmt(total)}</span></> : <Price amount={plan.price} />}
                {' '}<span>{c.month}</span>
              </div>
              <ul>
                {plan.items[lang].map((item) => <li key={item}>{item}</li>)}
              </ul>
              <a className={`btn ${plan.featured ? 'btn-lime' : 'btn-white'}`} href={order(plan, total)} data-umami-event="whatsapp" data-umami-event-place={`social-${plan.id}`}>{c.pick}</a>
            </div>
          );
        })}
      </div>
    </>
  );
}
