'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import Preview from './Preview';
import { designs, sizes } from '../lib/designs';
import { t } from '../lib/dict';
import { site } from '../lib/site';
import { isSaudiMobile } from '../lib/phone';

const fmt = (n) => n.toLocaleString('en-US');

export default function OrderForm({ lang }) {
  const d = t(lang).order;
  const params = useSearchParams();
  const design = designs.find((x) => x.id === params.get('design')) || designs[0];
  const [sizeId, setSizeId] = useState('five');
  const [form, setForm] = useState({ name: '', city: '', phone: '', details: '', ar: true, en: true });
  const [errors, setErrors] = useState({});
  const size = sizes.find((s) => s.id === sizeId);

  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [k]: value }));
    setErrors((prev) => {
      if (!prev[k] && !((k === 'ar' || k === 'en') && prev.langs)) return prev;
      const next = { ...prev };
      delete next[k];
      if (k === 'ar' || k === 'en') delete next.langs;
      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = d.errName;
    if (!form.phone.trim()) next.phone = d.errPhone;
    else if (!isSaudiMobile(form.phone)) next.phone = d.errPhoneFormat;
    if (!form.ar && !form.en) next.langs = d.errLangs;
    setErrors(next);
    if (Object.keys(next).length) return;
    const langs = [form.ar && d.langAr, form.en && d.langEn].filter(Boolean).join(' + ');
    const msg = [
      d.waIntro,
      `• ${d.design}: ${design.name[lang]} (${design.id})`,
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
              <input value={form.name} onChange={set('name')} placeholder={d.namePh} required autoComplete="organization" aria-invalid={errors.name ? 'true' : undefined} aria-describedby={errors.name ? 'order-name-error' : undefined} />
              {errors.name && <span className="field-err" id="order-name-error" role="alert">{errors.name}</span>}
            </label>
            <label className="field">{d.phone}
              <input value={form.phone} onChange={set('phone')} placeholder={d.phonePh} required inputMode="tel" autoComplete="tel" dir="ltr" aria-invalid={errors.phone ? 'true' : undefined} aria-describedby={errors.phone ? 'order-phone-error' : undefined} />
              {errors.phone && <span className="field-err" id="order-phone-error" role="alert">{errors.phone}</span>}
            </label>
            <label className="field">{d.city}
              <input value={form.city} onChange={set('city')} placeholder={d.cityPh} autoComplete="address-level2" />
            </label>
          </div>
          <label className="field">{d.details}
            <textarea rows={4} value={form.details} onChange={set('details')} placeholder={d.detailsPh} />
          </label>
          <div className="checks" role="group" aria-label={d.langs} data-invalid={errors.langs ? 'true' : undefined} aria-describedby={errors.langs ? 'order-langs-error' : undefined}>
            <span style={{ fontWeight: 600 }}>{d.langs}</span>
            <label><input type="checkbox" checked={form.ar} onChange={set('ar')} />{d.langAr}</label>
            <label><input type="checkbox" checked={form.en} onChange={set('en')} />{d.langEn}</label>
            {errors.langs && <span className="field-err" id="order-langs-error" role="alert">{errors.langs}</span>}
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
        {Object.values(errors).some(Boolean) && <p className="err" role="alert">{d.required}</p>}
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
