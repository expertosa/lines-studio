import { Suspense } from 'react';
import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import OrderForm from '../../../components/OrderForm';
import { t } from '../../../lib/dict';
import { pageMeta } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({
    lang,
    path: 'order/',
    title: `${d.order.title} | ${d.brandFull}`,
    description: d.order.sub,
  });
}

export default async function Order({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return (
    <>
      <Header lang={lang} path="order/" />
      <main className="wrap">
        <p style={{ paddingTop: 28 }}>
          <Link href={`/${lang}/gallery/`} style={{ fontWeight: 600 }}>{d.order.back}</Link>
        </p>
        <Suspense fallback={<div style={{ minHeight: 600 }} />}>
          <OrderForm lang={lang} />
        </Suspense>
      </main>
      <Footer lang={lang} />
    </>
  );
}
