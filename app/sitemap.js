import { siteUrl } from '../lib/seo';

export const dynamic = 'force-static';

const paths = ['', 'gallery/', 'order/', 'work/', 'social/', 'mcp/', 'privacy/', 'terms/'];

export default function sitemap() {
  const lastModified = '2026-11-11';
  return paths.flatMap((path) => ['ar', 'en'].map((lang) => {
    const ar = `${siteUrl}/ar/${path}`;
    const en = `${siteUrl}/en/${path}`;
    return {
      url: `${siteUrl}/${lang}/${path}`,
      lastModified,
      alternates: {
        languages: { ar, en, 'x-default': ar },
      },
    };
  }));
}
