import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import GalleryGrid from '../../../components/GalleryGrid';
import { todayFmt } from '../../../components/Price';
import { t } from '../../../lib/dict';
import { pageMeta } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({
    lang,
    path: 'gallery/',
    title: `${d.gallery.title} | ${d.brandFull}`,
    description: d.gallery.sub,
  });
}

export default async function Gallery({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return (
    <>
      <Header lang={lang} path="gallery/" />
      <main className="wrap" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div className="page-head">
          <h1>{d.gallery.title}</h1>
          <p>{d.gallery.sub}</p>
        </div>
        <GalleryGrid lang={lang} />
        <div className="cta-box">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <strong style={{ fontSize: 18 }}>{d.gallery.customT}</strong>
            <span style={{ color: '#4a4f57' }}>{d.gallery.customS(todayFmt)}</span>
          </div>
          <Link className="btn btn-ink" href={`/${lang}/#packages`}>{d.gallery.customC}</Link>
        </div>
      </main>
      <Footer lang={lang} />
    </>
  );
}
