import LegalPage from '../../../components/LegalPage';
import { privacy } from '../../../lib/legal';
import { t } from '../../../lib/dict';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  return { title: `${privacy[lang].title} | ${t(lang).brandFull}` };
}

export default async function Page({ params }) {
  const { lang } = await params;
  return <LegalPage lang={lang} doc={privacy[lang]} path="privacy/" />;
}
