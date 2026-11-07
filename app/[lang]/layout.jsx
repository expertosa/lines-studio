import '../globals.css';
import { t } from '../../lib/dict';
import { languages } from '../../lib/site';

export const dynamicParams = false;

export function generateStaticParams() {
  return languages.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const d = t(lang);
  return {
    title: d.meta.title,
    description: d.meta.desc,
    alternates: { languages: { ar: '/ar/', en: '/en/' } },
    openGraph: { title: d.meta.title, description: d.meta.desc, locale: lang === 'ar' ? 'ar_SA' : 'en_US', type: 'website' },
  };
}

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Alexandria:wght@500;700;800;900&family=Rubik:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
