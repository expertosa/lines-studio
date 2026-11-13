'use client';

import { useEffect, useRef } from 'react';

export default function VideoSwiper({ label, prevLabel, nextLabel, children }) {
  const track = useRef(null);

  function step(direction) {
    const el = track.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === 'rtl';
    const amount = Math.max(el.clientWidth * 0.8, 180) * direction;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: rtl ? -amount : amount, behavior: reduce ? 'auto' : 'smooth' });
  }

  function onKeyDown(event) {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      step(rtl ? -1 : 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      step(rtl ? 1 : -1);
    }
  }

  useEffect(() => {
    const el = track.current;
    if (!el) return undefined;
    let active = false;
    let lastX = 0;
    let originX = 0;
    let scrollAtStart = 0;

    function down(event) {
      if (event.button !== 0 && event.pointerType !== 'touch') return;
      scrollAtStart = el.scrollLeft;
      if (event.pointerType === 'touch') return;
      if (event.target.closest('a, button')) return;
      active = true;
      lastX = event.clientX;
      originX = event.clientX;
    }
    function move(event) {
      if (!active) return;
      const dx = event.clientX - lastX;
      lastX = event.clientX;
      if (Math.abs(event.clientX - originX) < 5) return;
      el.classList.add('is-grabbing');
      const rtl = getComputedStyle(el).direction === 'rtl';
      // scrollLeft assignment is ignored for RTL in Chromium; scrollBy is not.
      el.scrollBy({ left: rtl ? dx : -dx });
    }
    function up() {
      if (!active) return;
      active = false;
      el.classList.remove('is-grabbing');
    }
    function onClick(event) {
      if (Math.abs(el.scrollLeft - scrollAtStart) > 4) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('click', onClick, true);
    };
  }, []);

  return (
    <div className="vswiper">
      <div className="vswiper-nav">
        <button type="button" className="vswiper-btn vswiper-prev" onClick={() => step(-1)} aria-label={prevLabel}>
          <Chevron />
        </button>
        <button type="button" className="vswiper-btn vswiper-next" onClick={() => step(1)} aria-label={nextLabel}>
          <Chevron />
        </button>
      </div>
      <div
        className="vswiper-track"
        ref={track}
        role="region"
        aria-roledescription="carousel"
        aria-label={label}
        tabIndex={0}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M7 4l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
