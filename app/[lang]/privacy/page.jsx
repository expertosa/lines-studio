import LegalPage from '../../../components/LegalPage';
import { privacy } from '../../../lib/legal';
import { t } from '../../../lib/dict';
import { pageMeta } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return pageMeta({
    lang,
    path: 'privacy/',
    title: `${privacy[lang].title} | ${d.brandFull}`,
    description: lang === 'ar'
      ? 'كيف تجمع خطوط ستوديو بياناتك وتستخدمها وتحميها.'
      : 'How Lines Studio collects, uses and protects your data.',
  });
}

export default async function Page({ params }) {
  const { lang } = await params;
  return <LegalPage lang={lang} doc={privacy[lang]} path="privacy/" />;
}
