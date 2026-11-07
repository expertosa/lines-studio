import LegalPage from '../../../components/LegalPage';
import { terms } from '../../../lib/legal';
import { t } from '../../../lib/dict';
import { pageMeta } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({
    lang,
    path: 'terms/',
    title: `${terms[lang].title} | ${d.brandFull}`,
    description: lang === 'ar'
      ? 'شروط استخدام موقع خطوط ستوديو وطلب خدماته.'
      : 'Terms for using the Lines Studio website and ordering our services.',
  });
}

export default async function Page({ params }) {
  const { lang } = await params;
  return <LegalPage lang={lang} doc={terms[lang]} path="terms/" />;
}
