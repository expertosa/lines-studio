'use client';

import { useState } from 'react';
import Link from 'next/link';
import { site } from '../lib/site';
import { isSaudiMobile } from '../lib/phone';
import { adDialects, adPresets, adRequestMessage, adsCopy, adSwapKinds, needsLikenessConsent } from '../lib/ads';

export default function AdsForm({ lang }) {
  const c = adsCopy[lang] || adsCopy.ar;
  const ar = lang === 'ar';
  const [form, setForm] = useState({ name: '', phone: '', city: '', adUrl: '', dialect: 'najdi', captions: true, dub: false, details: '', consent: false });
  const [kinds, setKinds] = useState([]);
  const [presets, setPresets] = useState({});
  const [errors, setErrors] = useState({});

  const clear = (...keys) => setErrors((prev) => {
    const next = { ...prev };
    for (const k of keys) delete next[k];
    return next;
  });
  const set = (k) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((prev) => ({ ...prev, [k]: value }));
    clear(k, k === 'captions' || k === 'dub' ? 'kinds' : k, k === 'dub' ? 'consent' : k);
  };
  const toggle = (id) => {
    setKinds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
    clear('kinds', 'consent');
  };

  const needsConsent = needsLikenessConsent({ kinds, dub: form.dub });

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = c.errName;
    if (!form.phone.trim()) next.phone = c.errPhone;
    else if (!isSaudiMobile(form.phone)) next.phone = c.errPhoneFormat;
    if (form.adUrl.trim() && !/^https:\/\/\S+$/i.test(form.adUrl.trim())) next.adUrl = c.errUrl;
    if (kinds.length === 0 && !form.captions && !form.dub) next.kinds = c.errKinds;
    if (needsConsent && !form.consent) next.consent = c.errConsent;
    setErrors(next);
    if (Object.keys(next).length) return;
    const msg = adRequestMessage({
      lang,
      name: form.name.trim(),
      phone: form.phone.trim(),
      city: form.city.trim(),
      adUrl: form.adUrl.trim(),
      kinds,
      presets,
      dialect: form.captions || form.dub ? form.dialect : null,
      captions: form.captions,
      dub: form.dub,
      details: form.details.trim(),
      consent: needsConsent && form.consent,
    });
    window.umami?.track('ads-order', { kinds: kinds.join(',') || 'none', dub: form.dub ? 'yes' : 'no' });
    window.open(`https://wa.me/${site.whatsapp}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  };

  const err = (k) => errors[k] && <span className="field-err" id={`ads-${k}-error`} role="alert">{errors[k]}</span>;
  const aria = (k) => ({ 'aria-invalid': errors[k] ? 'true' : undefined, 'aria-describedby': errors[k] ? `ads-${k}-error` : undefined });

  return (
    <form className="ads-form" onSubmit={submit} noValidate>
      <div className="fields">
        <label className="field">{c.name}
          <input value={form.name} onChange={set('name')} placeholder={c.namePh} required autoComplete="organization" {...aria('name')} />
          {err('name')}
        </label>
        <label className="field">{c.phone}
          <input value={form.phone} onChange={set('phone')} placeholder={c.phonePh} required inputMode="tel" autoComplete="tel" dir="ltr" {...aria('phone')} />
          {err('phone')}
        </label>
        <label className="field">{c.city}
          <input value={form.city} onChange={set('city')} placeholder={c.cityPh} autoComplete="address-level2" />
        </label>
      </div>
      <label className="field">{c.adUrl}
        <input value={form.adUrl} onChange={set('adUrl')} placeholder={c.adUrlPh} inputMode="url" dir="ltr" {...aria('adUrl')} />
        <small className="field-hint">{c.adUrlHint}</small>
        {err('adUrl')}
      </label>

      <fieldset className="ads-kinds" data-invalid={errors.kinds ? 'true' : undefined} aria-describedby={errors.kinds ? 'ads-kinds-error' : undefined}>
        <legend>{c.kindsL}</legend>
        <div className="chips">
          {adSwapKinds.map((k) => (
            <button key={k.id} type="button" className="chip" aria-pressed={kinds.includes(k.id)} onClick={() => toggle(k.id)}>{k[lang] || k.ar}</button>
          ))}
        </div>
        {kinds.filter((k) => adPresets[k]?.length).map((k) => (
          <label key={k} className="field ads-preset">
            {(adSwapKinds.find((x) => x.id === k) || {})[lang]} · {c.presetL}
            <select value={presets[k] || ''} onChange={(e) => setPresets((prev) => ({ ...prev, [k]: e.target.value || undefined }))}>
              <option value="">{c.presetAny}</option>
              {adPresets[k].map((p) => <option key={p.id} value={p.id}>{p[lang] || p.ar}</option>)}
            </select>
          </label>
        ))}
        {err('kinds')}
      </fieldset>

      <div className="checks">
        <label><input type="checkbox" checked={form.captions} onChange={set('captions')} />{c.captions}</label>
        <label><input type="checkbox" checked={form.dub} onChange={set('dub')} />{c.dub}</label>
        {(form.captions || form.dub) && (
          <label className="field ads-dialect">{c.dialectL}
            <select value={form.dialect} onChange={set('dialect')}>
              {adDialects.map((d) => <option key={d.id} value={d.id}>{d[lang] || d.ar}</option>)}
            </select>
          </label>
        )}
      </div>

      <label className="field">{c.details}
        <textarea rows={3} value={form.details} onChange={set('details')} placeholder={c.detailsPh} />
      </label>

      {needsConsent && (
        <label className="addon" data-invalid={errors.consent ? 'true' : undefined}>
          <input type="checkbox" checked={form.consent} onChange={set('consent')} aria-describedby={errors.consent ? 'ads-consent-error' : undefined} />
          <span>
            <strong>{c.consent}</strong>
            {err('consent')}
          </span>
        </label>
      )}

      <div className="ads-submit">
        <strong>{c.price}</strong>
        {Object.values(errors).some(Boolean) && <p className="err" role="alert">{c.required}</p>}
        <button type="submit" className="btn btn-ink">{c.submit}</button>
        <p className="ads-note">{c.note}</p>
        <p className="ads-note">
          {ar ? 'بإرسال الطلب توافق على ' : 'By sending, you agree to the '}
          <Link href={`/${lang}/terms/`}>{ar ? 'الشروط والأحكام' : 'Terms'}</Link>
          {ar ? ' و' : ' and '}
          <Link href={`/${lang}/privacy/`}>{ar ? 'سياسة الخصوصية' : 'Privacy Policy'}</Link>.
        </p>
      </div>
    </form>
  );
}
