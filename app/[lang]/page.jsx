import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { t } from '../../lib/dict';
import { site } from '../../lib/site';
import { pageMeta } from '../../lib/seo';
import { featuredWorks } from '../../lib/work';
import { socialCopy } from '../../lib/social';
import Price, { offerBadge, todayFmt } from '../../components/Price';
import { launchOffer, promoText } from '../../lib/promo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({ lang, title: d.meta.title, description: d.meta.desc });
}

export default async function Home({ params }) {
  const { lang } = await params;
  const d = t(lang);
  const wa = `https://wa.me/${site.whatsapp}`;
  const sc = socialCopy[lang] || socialCopy.ar;
  const items = [...d.marquee, ...d.marquee, ...d.marquee, ...d.marquee];

  return (
    <>
      <Header lang={lang} />

      <section className="dark">
        <div className="wrap hero">
          <div className="hero-copy">
            <span className="pill">{d.hero.badge}</span>
            <h1>
              {d.hero.t1} <span className="hl">{d.hero.t2}</span> {d.hero.t3}
            </h1>
            <p className="hero-sub">{d.hero.sub}</p>
            <div className="row">
              <Link className="btn btn-lime" href={`/${lang}/gallery/`}>{d.hero.cta}</Link>
              <a className="btn btn-ghost" href="#packages">{d.hero.cta2}</a>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="card-tilt" style={{ top: 20, insetInlineStart: 10, width: 300, height: 360, background: 'var(--lilac)', transform: 'rotate(6deg)' }}>
              <div className="b" style={{ height: 14, width: '50%', background: '#111' }} />
              <div className="b" style={{ height: 150, background: '#fff', borderRadius: 18 }} />
              <div className="b" style={{ height: 10, width: '85%', background: '#9e88f0' }} />
              <div className="b" style={{ height: 10, width: '60%', background: '#9e88f0' }} />
              <div style={{ height: 40, width: '55%', background: '#111', borderRadius: 999, marginTop: 'auto' }} />
            </div>
            <div className="card-tilt" style={{ top: 90, insetInlineEnd: 0, width: 280, height: 320, background: 'var(--coral)', transform: 'rotate(-7deg)' }}>
              <div className="b" style={{ height: 14, width: '40%', background: '#fff' }} />
              <div className="b" style={{ height: 120, background: '#ffd9cf', borderRadius: 18 }} />
              <div className="b" style={{ height: 10, width: '80%', background: '#ffb3a1' }} />
              <div style={{ height: 40, width: '50%', background: '#fff', borderRadius: 999, marginTop: 'auto' }} />
            </div>
            <div className="sticker" style={{ bottom: 0, insetInlineStart: 120 }}>
              <span>{d.hero.from}</span>
              <strong>{todayFmt(1900)}</strong>
              <span>{d.hero.sar}</span>
            </div>
          </div>
        </div>
      </section>

      <div className="marquee-wrap"><div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {items.map((m, i) => (
            <span key={i}>{m} <span style={{ marginInlineStart: 36 }}>✦</span></span>
          ))}
        </div>
      </div></div>

      <section id="packages" className="wrap section">
        <div className="section-head">
          <h2 className="h2">{d.packages.title}</h2>
          <p className="lead">{d.packages.sub}</p>
        </div>
        {offerBadge(lang) && <p className="offer-note"><b>{offerBadge(lang)}</b> · {(promoText[lang] || promoText.ar).months(launchOffer.subscriptionMonths)}</p>}
        <div className="grid-3">
          {d.packages.items.map((p, i) => {
            const href = p.href === 'gallery' ? `/${lang}/gallery/` : wa;
            const btn = ['btn-ink', 'btn-outline', 'btn-lime'][i];
            return (
              <div key={p.name} className={`pkg pkg-${i + 1}`}>
                <span className="tag">{p.tag}</span>
                <h3>{p.name}</h3>
                <p style={{ fontSize: 17, lineHeight: 1.8 }}>{p.desc}</p>
                <div className="price"><Price amount={p.amount} plus={p.plus} /> <span>{p.unit}</span></div>
                <p style={{ fontSize: 15 }}>{p.note(todayFmt)}</p>
                {p.href === 'gallery'
                  ? <Link className={`btn ${btn}`} href={href}>{p.cta}</Link>
                  : <a className={`btn ${btn}`} href={href} data-umami-event="whatsapp" data-umami-event-place={`package-${i + 1}`}>{p.cta}</a>}
              </div>
            );
          })}
        </div>
      </section>

      <section id="how" className="dark">
        <div className="wrap section">
          <h2 className="h2">{d.how.t1}<br />{d.how.t2.split(' ')[0]} <span style={{ color: 'var(--lime)' }}>{d.how.t2.split(' ').slice(1).join(' ')}</span></h2>
          <ol className="steps">
            {d.how.steps.map((s, i) => (
              <li key={s.n} className="step">
                <span className="n" style={{ color: ['var(--lime)', 'var(--lilac)', 'var(--coral)', '#fff'][i] }}>{s.n}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="work" className="wrap section">
        <div className="work-band">
          <div className="section-head">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2 className="h2">{d.work.title}</h2>
              <p className="lead">{d.work.sub}</p>
            </div>
            <Link className="btn btn-lime" href={`/${lang}/work/`}>{d.work.all}</Link>
          </div>
          <div className="work-row">
            {featuredWorks.map((item) => (
              <Link key={item.id} className="work-mini" href={`/${lang}/work/#${item.id}`}>
                <img src={item.image} alt={item.alt[lang]} width={800} height={500} loading="lazy" decoding="async" />
                <strong>{item.name[lang]}</strong>
                <span>{item.desc[lang]}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="video" className="dark">
        <div className="wrap section video-band">
          <figure className="video-sample">
            <video src="/video/launch-3d-ar.mp4" poster="/video/launch-3d-ar.webp" width={720} height={1280} muted loop playsInline autoPlay preload="metadata" aria-label={d.video.sample} />
            <figcaption>{d.video.sample}</figcaption>
          </figure>
          <div className="video-copy">
            <span className="pill">{d.video.tag}</span>
            <h2 className="h2">{d.video.title}</h2>
            <p className="lead">{d.video.sub}</p>
            <div className="video-items">
              {d.video.items.map((v, i) => (
                <div key={v.name} className={`video-item video-item-${i + 1}`}>
                  <h3>{v.name}</h3>
                  <p>{v.desc}</p>
                  <span>{v.note}</span>
                </div>
              ))}
            </div>
            <p className="video-price">{d.video.price}</p>
            <a className="btn btn-lime" href={`${wa}?text=${encodeURIComponent(d.video.wa)}`} data-umami-event="whatsapp" data-umami-event-place="video">{d.video.cta}</a>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingTop: 72 }}>
        <div className="social-strip">
          <div>
            <h2>{sc.homeT}</h2>
            <p>{sc.homeS}</p>
          </div>
          <Link className="btn btn-ink" href={`/${lang}/social/`}>{sc.homeC}</Link>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 96, paddingTop: 24 }}>
        <div className="trial">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 420px' }}>
            <h2>{d.trial.title}</h2>
            <p style={{ fontSize: 19, color: '#333' }}>{d.trial.sub(todayFmt)}</p>
          </div>
          <a className="btn btn-ink" href={wa} data-umami-event="whatsapp" data-umami-event-place="trial">{d.trial.cta}</a>
        </div>
      </section>

      <Footer lang={lang} />
    </>
  );
}
