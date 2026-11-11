'use client';

import { useState } from 'react';
import { checkCode, promoText } from '../lib/promo';

/** Promo code field. Calls onChange({ code, pct }) when a code is accepted, onChange(null) when removed. */
export default function PromoCode({ lang, scope, value, onChange }) {
  const p = promoText[lang] || promoText.ar;
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = async () => {
    if (!input.trim()) return;
    setBusy(true);
    const result = await checkCode(input, scope);
    setBusy(false);
    window.umami?.track('promo', { scope, result: result.error || 'ok' });
    if (result.error) {
      setError(p[result.error]);
      onChange(null);
      return;
    }
    setError('');
    onChange(result);
  };

  if (value) {
    return (
      <div className="promo promo-ok" role="status">
        <span>✓ <bdi dir="ltr">{value.code}</bdi> · {p.ok(value.pct)}</span>
        <button type="button" onClick={() => { onChange(null); setInput(''); }}>{p.remove}</button>
      </div>
    );
  }
  return (
    <div className="promo">
      <label className="promo-row">
        <span className="sr-only">{p.field}</span>
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }}
          placeholder={p.field}
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={error ? 'true' : undefined}
        />
        <button type="button" onClick={apply} disabled={busy || !input.trim()}>{p.apply}</button>
      </label>
      {error && <span className="promo-err" role="alert">{error}</span>}
    </div>
  );
}
