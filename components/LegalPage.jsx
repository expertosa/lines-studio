import Header from './Header';
import Footer from './Footer';
import { site } from '../lib/site';

export default function LegalPage({ lang, doc, path }) {
  return (
    <>
      <Header lang={lang} path={path} />
      <main className="wrap legal">
        <h1>{doc.title}</h1>
        <p className="legal-date">{lang === 'ar' ? 'آخر تحديث:' : 'Last updated:'} <bdi dir="ltr">{site.updated}</bdi></p>
        <p className="legal-intro">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            {s.p.map((x) => <p key={x}>{x}</p>)}
          </section>
        ))}
      </main>
      <Footer lang={lang} />
    </>
  );
}
