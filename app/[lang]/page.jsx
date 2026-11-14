import Link from 'next/link';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { t } from '../../lib/dict';
import { site } from '../../lib/site';
import { pageMeta } from '../../lib/seo';
import { featuredWorks, launchVideo, workCategories, works } from '../../lib/work';
import { adCategories, featuredAds } from '../../lib/sample-ads';
import VideoCard from '../../components/VideoCard';
import VideoSwiper from '../../components/VideoSwiper';
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
      <main>
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
              <Link className="btn btn-ghost" href={`/${lang}/ads/`}>{d.hero.cta3}</Link>
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
          <div className="video-copy">
            <span className="pill">{d.video.tag}</span>
            <h2 className="h2">{d.video.title}</h2>
            <p className="lead">{d.video.sub}</p>
          </div>
          <VideoSwiper label={d.video.swiper} prevLabel={d.video.prev} nextLabel={d.video.next}>
            <VideoCard
              title={d.video.sample}
              description={d.video.items[0].desc}
              alt={d.video.sample}
              poster={launchVideo.poster}
              video={launchVideo.src}
              fit="cover"
              ctaHref={`${wa}?text=${encodeURIComponent(d.video.wa)}`}
              ctaLabel={d.video.cta}
              soundOn={d.video.unmute}
              soundOff={d.video.mute}
              playLabel={d.video.play}
              detailsLabel={d.video.details}
              place="video-card"
              heading="h3"
            />
            {works.map((item, index) => (
              <VideoCard
                key={item.id}
                title={item.name[lang]}
                description={item.desc[lang]}
                category={workCategories.find((cat) => cat.id === item.cat)?.[lang]}
                alt={item.alt[lang]}
                image={item.image}
                video={item.video}
                poster={item.poster}
                fit={item.video ? 'cover' : 'contain'}
                ctaHref={`${wa}?text=${encodeURIComponent(d.work.likeWa(item.name[lang]))}`}
                ctaLabel={d.work.like}
                visitHref={item.url}
                visitLabel={d.work.visit}
                visitHint={lang === 'ar' ? '(يفتح في تبويب جديد)' : '(opens in a new tab)'}
                soundOn={d.video.unmute}
                soundOff={d.video.mute}
                playLabel={d.video.play}
                detailsLabel={d.work.details}
                place="video-work"
                heading="h3"
                defer={index > 1}
              />
            ))}
          </VideoSwiper>
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
          <div className="row">
            <a className="btn btn-lime" href={`${wa}?text=${encodeURIComponent(d.video.wa)}`} data-umami-event="whatsapp" data-umami-event-place="video">{d.video.cta}</a>
            <Link className="btn btn-ghost" href={`/${lang}/ads/`}>{d.video.ads}</Link>
          </div>
        </div>
      </section>

      <section id="sample-ads" className="dark">
        <div className="wrap section video-band">
          <div className="section-head">
            <div className="video-copy">
              <h2 className="h2">{d.ads.homeT}</h2>
              <p className="lead">{d.ads.homeS}</p>
            </div>
            <Link className="btn btn-lime" href={`/${lang}/ads/`}>{d.ads.homeAll}</Link>
          </div>
          <VideoSwiper label={d.ads.swiper} prevLabel={d.video.prev} nextLabel={d.video.next}>
            {featuredAds.map((item, index) => (
              <VideoCard
                key={item.id}
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
                playLabel={d.video.play}
                detailsLabel={d.ads.details}
                place="home-ad"
                heading="h3"
                defer={index > 1}
              />
            ))}
          </VideoSwiper>
          <p className="video-price">{d.ads.homeNote}</p>
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

      <section className="wrap section">
        <h2 className="h2">{d.homeFaq.title}</h2>
        <div className="faq">
          {d.homeFaq.items.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
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
      </main>

      <Footer lang={lang} />
    </>
  );
}
