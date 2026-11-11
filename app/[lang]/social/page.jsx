import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import { pageMeta } from '../../../lib/seo';
import { site } from '../../../lib/site';
import { socialCopy, socialPackages } from '../../../lib/social';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const c = socialCopy[lang] || socialCopy.ar;
  return pageMeta({ lang, path: 'social/', title: c.metaTitle, description: c.metaDesc });
}

const fmt = (n) => n.toLocaleString('en-US');

export default async function Social({ params }) {
  const { lang } = await params;
  const c = socialCopy[lang] || socialCopy.ar;
  const wa = `https://wa.me/${site.whatsapp}`;
  const order = (p) => `${wa}?text=${encodeURIComponent(`${c.waIntro}\n• ${p.name[lang]} — ${fmt(p.price)} ${c.month}`)}`;
  const colors = ['var(--lime)', 'var(--lilac)', 'var(--coral)', '#fff'];

  return (
    <>
      <Header lang={lang} path="social/" />

      <section className="dark">
        <div className="wrap section social-hero">
          <span className="pill">{c.badge}</span>
          <h1>{c.t1} <span className="hl">{c.t2}</span></h1>
          <p className="hero-sub">{c.sub}</p>
          <p className="social-platforms">{c.platforms}</p>
          <a className="btn btn-lime" href="#plans">{c.cta}</a>
        </div>
      </section>

      <section className="wrap section">
        <h2 className="h2">{c.howT}</h2>
        <ol className="steps steps-light">
          {c.how.map((s, i) => (
            <li key={s.t} className="step">
              <span className="n" style={{ color: ['var(--ink)', '#7b61e8', 'var(--coral)', 'var(--ink)'][i] }}>{lang === 'ar' ? '١٢٣٤'[i] : i + 1}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="plans" className="dark">
        <div className="wrap section" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div className="section-head">
            <h2 className="h2">{c.pkgT}</h2>
            <p className="lead" style={{ color: 'var(--soft)' }}>{c.pkgS}</p>
          </div>
          <div className="social-plans">
            {socialPackages.map((p, i) => (
              <div key={p.id} className={`social-plan${p.featured ? ' social-plan-featured' : ''}`}>
                <span className="tag" style={{ background: colors[i], color: 'var(--ink)' }}>{p.tag[lang]}</span>
                <h3>{p.name[lang]}</h3>
                <div className="price">{fmt(p.price)} <span>{c.month}</span></div>
                <ul>
                  {p.items[lang].map((item) => <li key={item}>{item}</li>)}
                </ul>
                <a className={`btn ${p.featured ? 'btn-lime' : 'btn-white'}`} href={order(p)} data-umami-event="whatsapp" data-umami-event-place={`social-${p.id}`}>{c.pick}</a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="wrap section">
        <h2 className="h2">{c.faqT}</h2>
        <div className="faq">
          {c.faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 96 }}>
        <div className="trial">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: '1 1 420px' }}>
            <h2>{c.endT}</h2>
            <p style={{ fontSize: 19, color: '#333' }}>{c.endS}</p>
          </div>
          <a className="btn btn-ink" href={wa} data-umami-event="whatsapp" data-umami-event-place="social-end">{c.endC}</a>
        </div>
      </section>

      <Footer lang={lang} />
    </>
  );
}
