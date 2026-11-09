import Link from 'next/link';
import Header from '../../../components/Header';
import Footer from '../../../components/Footer';
import CopyButton from '../../../components/CopyButton';
import { t } from '../../../lib/dict';
import { site } from '../../../lib/site';
import { pageMeta } from '../../../lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const m = t(lang).mcp;
  return pageMeta({ lang, path: 'mcp/', title: m.metaTitle, description: m.metaDesc });
}

export default async function Mcp({ params }) {
  const { lang } = await params;
  const m = t(lang).mcp;
  return (
    <>
      <Header lang={lang} path="mcp/" />

      <section className="dark">
        <div className="wrap mcp-hero">
          <span className="pill">{m.badge}</span>
          <h1>
            {m.t1} <span className="hl">{m.t2}</span>
          </h1>
          <p className="hero-sub">{m.sub}</p>
          <div className="endpoint">
            <span className="endpoint-label">{m.endpoint}</span>
            <code dir="ltr">{site.mcpUrl}</code>
            <CopyButton text={site.mcpUrl} label={m.copy} done={m.copied} />
          </div>
          <p className="mcp-free">{m.free}</p>
        </div>
      </section>

      <main>
        <section className="wrap section">
          <h2 className="h2">{m.connectT}</h2>
          <div className="connect-grid">
            {m.connect.map((c) => (
              <div key={c.name} className="connect-card">
                <h3>{c.name}</h3>
                {c.code ? (
                  <div className="code-wrap">
                    <pre dir="ltr"><code>{c.code}</code></pre>
                    <CopyButton text={c.code} label={m.copy} done={m.copied} />
                  </div>
                ) : (
                  <p>{c.steps}</p>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="wrap section" style={{ paddingBlockStart: 0 }}>
          <h2 className="h2">{m.toolsT}</h2>
          <ul className="tool-grid">
            {m.tools.map((tool) => (
              <li key={tool.id} className="tool">
                <code dir="ltr">{tool.id}</code>
                <p>{tool.d}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="wrap section" style={{ paddingBlockStart: 0 }}>
          <div className="work-band">
            <h2 className="h2">{m.tryT}</h2>
            <ul className="tries">
              {m.tries.map((q) => <li key={q}>{q}</li>)}
            </ul>
          </div>
        </section>

        <section className="wrap" style={{ paddingBlockEnd: 96 }}>
          <div className="trial">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 640 }}>
              <h2>{m.ctaT}</h2>
              <p style={{ fontSize: 18, lineHeight: 1.8 }}>{m.ctaS}</p>
            </div>
            <Link className="btn btn-ink" href={`/${lang}/gallery/`}>{m.cta}</Link>
          </div>
        </section>
      </main>

      <Footer lang={lang} />
    </>
  );
}
