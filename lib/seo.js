import { site } from './site';

export const siteUrl = `https://${site.domain}`;

/** Values already published on the site: name, CR, email, WhatsApp, Riyadh. */
export function organizationJsonLd() {
  const phone = `+${site.whatsapp}`;
  return {
    '@context': 'https://schema.org',
    '@type': ['Organization', 'LocalBusiness'],
    name: 'خطوط ستوديو',
    alternateName: 'Lines Studio',
    url: siteUrl,
    logo: `${siteUrl}/icon-192.png`,
    image: `${siteUrl}/og.png`,
    email: site.email,
    telephone: phone,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Riyadh',
      addressCountry: 'SA',
    },
    identifier: {
      '@type': 'PropertyValue',
      name: 'Commercial Registration',
      propertyID: 'CR',
      value: site.crNumber,
    },
  };
}

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
