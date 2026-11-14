import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import AdsGrid from '../../../components/AdsGrid';
import { t } from '../../../lib/dict';
import { pageMeta, faqJsonLd } from '../../../lib/seo';
import { site } from '../../../lib/site';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({
    lang,
    path: 'ads/',
    title: d.ads.metaTitle,
    description: d.ads.metaDesc,
  });
}

export default async function AdsPage({ params }) {
  const { lang } = await params;
  const d = t(lang);
  const wa = `https://wa.me/${site.whatsapp}`;
  const faqLd = JSON.stringify(faqJsonLd(d.ads.faq)).replace(/</g, '\\u003c');

  return (
    <>
      <Header lang={lang} path="ads/" />
      <main>
        <div className="work-stage">
          <div className="wrap work-stage-inner">
            <div className="page-head">
              <h1>{d.ads.pageTitle}</h1>
              <p>{d.ads.pageSub}</p>
              <p>{d.ads.disclaimer}</p>
            </div>
            <AdsGrid lang={lang} />
          </div>
        </div>

        <section className="wrap section">
          <h2 className="h2">{d.ads.howT}</h2>
          <ol className="steps steps-light">
            {d.ads.how.map((s, i) => (
              <li key={s.t} className="step">
                <span className="n" style={{ color: ['var(--ink)', '#7b61e8', 'var(--coral)', 'var(--ink)'][i] }}>{lang === 'ar' ? '١٢٣٤'[i] : i + 1}</span>
                <h3>{s.t}</h3>
                <p>{s.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="wrap section">
          <h2 className="h2">{d.ads.faqT}</h2>
          <div className="faq">
            {d.ads.faq.map((f) => (
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
              <h2>{d.ads.endT}</h2>
              <p style={{ fontSize: 19, color: '#333' }}>{d.ads.endS}</p>
            </div>
            <a className="btn btn-ink" href={`${wa}?text=${encodeURIComponent(d.ads.wa)}`} data-umami-event="whatsapp" data-umami-event-place="ads-end">{d.ads.endC}</a>
          </div>
        </section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: faqLd }} />
      </main>
      <Footer lang={lang} />
    </>
  );
}
