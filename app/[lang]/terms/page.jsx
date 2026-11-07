import LegalPage from '../../../components/LegalPage';
import { terms } from '../../../lib/legal';
import { t } from '../../../lib/dict';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  return { title: `${terms[lang].title} | ${t(lang).brandFull}` };
}

export default async function Page({ params }) {
  const { lang } = await params;
  return <LegalPage lang={lang} doc={terms[lang]} path="terms/" />;
}
