import Link from 'next/link';
import { t } from '../lib/dict';
import { site } from '../lib/site';

export default function Footer({ lang }) {
  const d = t(lang);
  const ar = lang === 'ar';
  return (
    <footer className="dark">
      <div className="wrap footer">
        <span>
          <strong style={{ fontFamily: 'var(--display)', color: '#fff' }}>{d.brandFull}</strong> · {d.footer.city} · {d.footer.cr} {site.crNumber}
        </span>
        <nav className="footer-links" aria-label={ar ? 'روابط' : 'Links'}>
          <a href={`https://wa.me/${site.whatsapp}`} dir="ltr" data-umami-event="whatsapp" data-umami-event-place="footer">{site.whatsappDisplay}</a>
          <a href={`mailto:${site.email}`}>{site.email}</a>
          <Link href={`/${lang}/work/`}>{ar ? 'أعمالنا' : 'Work'}</Link>
          <Link href={`/${lang}/mcp/`}>{ar ? 'MCP للوكلاء' : 'MCP for agents'}</Link>
          <Link href={`/${lang}/privacy/`}>{ar ? 'سياسة الخصوصية' : 'Privacy'}</Link>
          <Link href={`/${lang}/terms/`}>{ar ? 'الشروط والأحكام' : 'Terms'}</Link>
        </nav>
      </div>
    </footer>
  );
}
