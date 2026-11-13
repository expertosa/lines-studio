import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import WorkGrid from '../../../components/WorkGrid';
import { t } from '../../../lib/dict';
import { pageMeta } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({
    lang,
    path: 'work/',
    title: `${d.work.pageTitle} | ${d.brandFull}`,
    description: d.work.metaDesc,
  });
}

export default async function Work({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return (
    <>
      <Header lang={lang} path="work/" />
      <main className="work-stage">
        <div className="wrap work-stage-inner">
          <div className="page-head">
            <h1>{d.work.pageTitle}</h1>
            <p>{d.work.pageSub}</p>
          </div>
          <WorkGrid lang={lang} />
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
