import { site } from './site';

export const siteUrl = `https://${site.domain}`;

// path is '' for the home page, or 'gallery/' style with a trailing slash.
export function pageMeta({ lang, path = '', title, description }) {
  const suffix = path.replace(/^\/+/, '');
  const here = `${siteUrl}/${lang}/${suffix}`;
  const ar = `${siteUrl}/ar/${suffix}`;
  const en = `${siteUrl}/en/${suffix}`;
  const image = {
    url: '/og.png',
    width: 1200,
    height: 630,
    alt: lang === 'ar' ? 'خطوط ستوديو' : 'Lines Studio',
  };
  return {
    title,
    description,
    alternates: {
      canonical: here,
      languages: { ar, en, 'x-default': ar },
    },
    openGraph: {
      title,
      description,
      url: here,
      siteName: lang === 'ar' ? 'خطوط ستوديو' : 'Lines Studio',
      locale: lang === 'ar' ? 'ar_SA' : 'en_US',
      alternateLocale: lang === 'ar' ? ['en_US'] : ['ar_SA'],
      type: 'website',
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og.png'],
    },
  };
}
