import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AdsForm from '../../../components/AdsForm';
import { pageMeta } from '../../../lib/seo';
import { adsCopy, adSwapKinds } from '../../../lib/ads';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const c = adsCopy[lang] || adsCopy.ar;
  return pageMeta({ lang, path: 'ads/', title: c.metaTitle, description: c.metaDesc });
}

export default async function Ads({ params }) {
  const { lang } = await params;
  const c = adsCopy[lang] || adsCopy.ar;
  const ar = lang === 'ar';

  return (
    <>
      <Header lang={lang} path="ads/" />
      <main>
      <section className="dark">
        <div className="wrap section social-hero">
          <span className="pill">{c.badge}</span>
          <h1>{c.t1} <span className="hl">{c.t2}</span></h1>
          <p className="hero-sub">{c.sub}</p>
          <a className="btn btn-lime" href="#request">{c.cta}</a>
        </div>
      </section>

      <section className="wrap section">
        <div className="section-head">
          <h2 className="h2">{c.swapT}</h2>
          <p className="lead">{c.swapS}</p>
        </div>
        <ul className="ads-swaps">
          {adSwapKinds.map((k) => (
            <li key={k.id} className="ads-swap">
              <h3>{k[lang] || k.ar}</h3>
              <p>{ar ? k.dAr : k.dEn}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="dark">
        <div className="wrap section">
          <h2 className="h2">{c.howT}</h2>
          <ol className="steps">
            {c.how.map((s, i) => (
              <li key={s.t} className="step">
                <span className="n" style={{ color: ['var(--lime)', '#7b61e8', 'var(--coral)'][i] }}>{ar ? '١٢٣'[i] : i + 1}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="wrap section">
        <h2 className="h2">{c.rulesT}</h2>
        <ul className="ads-rules">
          {c.rules.map((r) => <li key={r}>{r}</li>)}
        </ul>
      </section>

      <section id="request" className="wrap section" style={{ paddingTop: 0 }}>
        <div className="section-head">
          <h2 className="h2">{c.formT}</h2>
          <p className="lead">{c.formS}</p>
        </div>
        <AdsForm lang={lang} />
      </section>

      <section className="wrap section" style={{ paddingTop: 0 }}>
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
      </main>

      <Footer lang={lang} />
    </>
  );
}
