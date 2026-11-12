import { Alexandria, Rubik } from 'next/font/google';
import '../globals.css';
import { languages, site } from '../../lib/site';
import { organizationJsonLd, siteUrl } from '../../lib/seo';

const alexandria = Alexandria({
  subsets: ['arabic', 'latin'],
  weight: ['500', '700', '800', '900'],
  display: 'swap',
  variable: '--font-display',
});

const rubik = Rubik({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-body',
});

const jsonLd = JSON.stringify(organizationJsonLd()).replace(/</g, '\\u003c');

export const dynamicParams = false;

export function generateStaticParams() {
  return languages.map((lang) => ({ lang }));
}

export const metadata = {
  metadataBase: new URL(siteUrl),
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport = {
  themeColor: '#111111',
};

export default async function RootLayout({ children, params }) {
  const { lang } = await params;
  return (
    <html lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'} className={`${alexandria.variable} ${rubik.variable}`}>
      <head>
        {site.analytics.src && site.analytics.websiteId && (
          <script defer src={site.analytics.src} data-website-id={site.analytics.websiteId} data-domains={site.domain} data-do-not-track="true" />
        )}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
