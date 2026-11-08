'use client';

import { useState } from 'react';

export default function CopyButton({ text, label, done }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  return (
    <button type="button" className="copy-btn" onClick={copy} aria-live="polite">
      {copied ? done : label}
    </button>
  );
}
