'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Preview from './Preview';
import { designs, sizes } from '../lib/designs';
import { t } from '../lib/dict';
import { site } from '../lib/site';

const fmt = (n) => n.toLocaleString('en-US');

export default function OrderForm({ lang }) {
  const d = t(lang).order;
  const params = useSearchParams();
  const design = designs.find((x) => x.id === params.get('design')) || designs[0];
  const [sizeId, setSizeId] = useState('five');
  const [form, setForm] = useState({ name: '', city: '', phone: '', details: '', ar: true, en: true });
  const [error, setError] = useState(false);
  const size = sizes.find((s) => s.id === sizeId);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim()) { setError(true); return; }
    setError(false);
    const langs = [form.ar && 'عربي', form.en && 'English'].filter(Boolean).join(' + ');
    const msg = [
      d.waIntro,
      `• ${d.design}: ${design.name.ar} (${design.id})`,
      `• ${d.size}: ${size.label[lang]} — ${fmt(size.price)} SAR`,
      `• ${d.name}: ${form.name}`,
      form.city && `• ${d.city}: ${form.city}`,
      `• ${d.phone}: ${form.phone}`,
      `• ${d.langs}: ${langs}`,
      form.details && `• ${d.details}: ${form.details}`,
    ].filter(Boolean).join('\n');
    window.open(`https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  return (
    <form className="order" onSubmit={submit} noValidate>
      <div className="order-main">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ fontSize: 'clamp(38px, 5vw, 56px)', fontWeight: 900 }}>{d.title}</h1>
          <p style={{ fontSize: 17, color: 'var(--muted)' }}>{d.sub}</p>
        </div>

        <div className="box">
          <div style={{ width: 160, borderRadius: 14, overflow: 'hidden', border: '1px solid var(--line)' }}>
            <Preview c={design.c} height={110} />
          </div>
          <div style={{ flex: 1, minWidth: 180, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 14, color: 'var(--muted)' }}>{d.chosen}</span>
            <strong style={{ fontFamily: 'var(--display)', fontSize: 24 }}>{design.name[lang]}</strong>
          </div>
          <Link href={`/${lang}/gallery/`} style={{ fontWeight: 700 }}>{d.change}</Link>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <legend style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>{d.s1}</legend>
          <div className="sizes" role="radiogroup" aria-label={d.s1}>
            {sizes.map((s) => (
              <button key={s.id} type="button" role="radio" aria-checked={sizeId === s.id} className="size" onClick={() => setSizeId(s.id)}>
                <strong>{s.label[lang]}</strong>
                <span>{s.hint[lang]}</span>
                <b>{fmt(s.price)} {lang === 'ar' ? 'ريال' : 'SAR'}</b>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <legend style={{ fontSize: 20, fontWeight: 600, marginBottom: 14 }}>{d.s2}</legend>
          <div className="fields">
            <label className="field">{d.name}
              <input value={form.name} onChange={set('name')} placeholder={d.namePh} required autoComplete="organization" />
            </label>
            <label className="field">{d.phone}
              <input value={form.phone} onChange={set('phone')} placeholder={d.phonePh} required inputMode="tel" autoComplete="tel" dir="ltr" />
            </label>
            <label className="field">{d.city}
              <input value={form.city} onChange={set('city')} placeholder={d.cityPh} autoComplete="address-level2" />
            </label>
          </div>
          <label className="field">{d.details}
            <textarea rows={4} value={form.details} onChange={set('details')} placeholder={d.detailsPh} />
          </label>
          <div className="checks">
            <span style={{ fontWeight: 600 }}>{d.langs}</span>
            <label><input type="checkbox" checked={form.ar} onChange={set('ar')} />عربي</label>
            <label><input type="checkbox" checked={form.en} onChange={set('en')} />English</label>
          </div>
        </fieldset>
      </div>

      <aside className="order-aside">
        <h2 style={{ fontSize: 22 }}>{d.summary}</h2>
        <dl className="sum">
          <dt>{d.design}</dt><dd>{design.name[lang]}</dd>
          <dt>{d.size}</dt><dd>{size.label[lang]}</dd>
          <dt>{d.delivery}</dt><dd>{d.days(size.days)}</dd>
          <dt>{d.includes}</dt><dd>{d.includesV}</dd>
        </dl>
        <div className="total">
          <span>{d.total}</span>
          <span><b>{fmt(size.price)}</b> {lang === 'ar' ? 'ريال' : 'SAR'}</span>
        </div>
        {error && <p className="err" role="alert">{d.required}</p>}
        <button type="submit" className="btn btn-lime">{d.submit}</button>
        <p style={{ fontSize: 13, color: 'var(--soft)', textAlign: 'center' }}>{d.note}</p>
        <p className="consent">
          {lang === 'ar' ? 'بإرسال الطلب توافق على ' : 'By sending, you agree to the '}
          <Link href={`/${lang}/terms/`}>{lang === 'ar' ? 'الشروط والأحكام' : 'Terms'}</Link>
          {lang === 'ar' ? ' و' : ' and '}
          <Link href={`/${lang}/privacy/`}>{lang === 'ar' ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link>.
        </p>
      </aside>
    </form>
  );
}
