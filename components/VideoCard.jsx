'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export default function VideoCard({
  id,
  title,
  description,
  category,
  alt,
  image,
  video,
  poster,
  fit = 'contain',
  note,
  script,
  scriptLabel,
  ctaHref,
  ctaLabel,
  visitHref,
  visitLabel,
  visitHint,
  soundOn,
  soundOff,
  playLabel = 'Play',
  detailsLabel,
  place,
  heading = 'h2',
  priority = false,
  eager = false,
  defer = false,
}) {
  const uid = useId();
  const mediaRef = useRef(null);
  const videoRef = useRef(null);
  const wantPlay = useRef(false);
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(!defer);
  const [armed, setArmed] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const still = poster || image;
  const Title = heading === 'h3' ? 'h3' : 'h2';

  function markMuted(el) {
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute('muted', '');
    el.playsInline = true;
    el.setAttribute('playsinline', '');
    el.autoplay = true;
  }

  function playEl(el) {
    markMuted(el);
    const pending = el.play();
    if (pending && typeof pending.then === 'function') {
      pending.then(() => {
        if (wantPlay.current) setNeedsTap(false);
      }).catch((err) => {
        if (!wantPlay.current) return;
        if (err && err.name === 'AbortError') return;
        setNeedsTap(true);
      });
    }
  }

  useEffect(() => {
    if (shown) return undefined;
    const box = mediaRef.current;
    if (!box) return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setShown(true);
        observer.disconnect();
      }
    }, { rootMargin: '120px' });
    observer.observe(box);
    return () => observer.disconnect();
  }, [shown]);

  useEffect(() => {
    if (!video) return undefined;
    const box = mediaRef.current;
    if (!box) return undefined;

    function near() {
      const rect = box.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight || 0;
      const vw = window.innerWidth || document.documentElement.clientWidth || 0;
      if (rect.width < 2 || rect.height < 2) return false;
      const marginY = Math.max(160, vh * 0.25);
      return rect.bottom > -marginY && rect.top < vh + marginY && rect.right > -80 && rect.left < vw + 80;
    }

    let alive = true;
    function sync() {
      if (!alive) return;
      const el = videoRef.current;
      if (near()) {
        wantPlay.current = true;
        setArmed(true);
        if (el && el.getAttribute('src') && el.paused) playEl(el);
      } else {
        wantPlay.current = false;
        setNeedsTap(false);
        if (el && !el.paused) el.pause();
      }
    }

    // Any overlap, including a card only partly in view. Far cards stay paused.
    const observer = new IntersectionObserver(sync, { root: null, rootMargin: '25% 0px', threshold: 0 });
    observer.observe(box);
    const scroller = box.closest('.vswiper-track');
    let scrollerObserver;
    if (scroller) {
      scrollerObserver = new IntersectionObserver(sync, { root: scroller, rootMargin: '0px 120px', threshold: 0 });
      scrollerObserver.observe(box);
    }
    sync();
    const raf = requestAnimationFrame(sync);
    // Hash jumps, font swap and the horizontal scroller can move a card into
    // view without a later intersection callback. Recheck until layout settles.
    const poll = window.setInterval(sync, 150);
    const stopPoll = window.setTimeout(() => window.clearInterval(poll), 2500);
    window.addEventListener('scroll', sync, { capture: true, passive: true });
    window.addEventListener('resize', sync);
    scroller?.addEventListener('scroll', sync, { passive: true });
    document.fonts?.ready?.then(() => { if (alive) sync(); });
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      window.clearInterval(poll);
      window.clearTimeout(stopPoll);
      observer.disconnect();
      scrollerObserver?.disconnect();
      window.removeEventListener('scroll', sync, { capture: true });
      window.removeEventListener('resize', sync);
      scroller?.removeEventListener('scroll', sync);
      wantPlay.current = false;
      const el = videoRef.current;
      if (el && !el.paused) el.pause();
    };
  }, [video]);

  useEffect(() => {
    if (!armed || !video) return undefined;
    const el = videoRef.current;
    if (!el || !wantPlay.current) return undefined;
    playEl(el);
    return undefined;
  }, [armed, video]);

  useEffect(() => {
    if (!video) return undefined;
    const onSound = (event) => {
      if (event.detail === uid) return;
      const el = videoRef.current;
      if (el) el.muted = true;
      setMuted(true);
    };
    window.addEventListener('lines-video-sound', onSound);
    return () => window.removeEventListener('lines-video-sound', onSound);
  }, [uid, video]);

  function toggleSound(event) {
    event.stopPropagation();
    const el = videoRef.current;
    if (!el) return;
    const nextMuted = !el.muted;
    if (!nextMuted) {
      window.dispatchEvent(new CustomEvent('lines-video-sound', { detail: uid }));
      wantPlay.current = true;
      if (!armed) flushSync(() => setArmed(true));
      if (!el.getAttribute('src') && video) {
        el.preload = 'auto';
        el.src = video;
      }
      const pending = el.play();
      if (pending && typeof pending.then === 'function') {
        pending.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
      }
    }
    el.muted = nextMuted;
    setMuted(nextMuted);
  }

  function onPlayClick(event) {
    event.preventDefault();
    event.stopPropagation();
    wantPlay.current = true;
    flushSync(() => setArmed(true));
    const el = videoRef.current;
    if (!el) return;
    markMuted(el);
    const pending = el.play();
    if (pending && typeof pending.then === 'function') {
      pending.then(() => setNeedsTap(false)).catch(() => setNeedsTap(true));
    }
  }

  return (
    <article id={id} className={`vcard${open ? ' is-open' : ''}${playing ? ' is-playing' : ''}`} data-video={video ? 'true' : 'false'}>
      <div className="vcard-media" ref={mediaRef}>
        {shown && (
          <img
            src={still}
            alt={alt}
            width={fit === 'cover' ? 720 : 800}
            height={fit === 'cover' ? 1280 : 500}
            loading={eager ? 'eager' : 'lazy'}
            {...(priority ? { fetchPriority: 'high' } : {})}
            decoding="async"
            draggable="false"
            className={fit === 'cover' ? 'is-cover' : 'is-contain'}
          />
        )}
        {video && (
          <video
            ref={videoRef}
            poster={still || undefined}
            data-src={video}
            src={armed ? video : undefined}
            autoPlay
            muted
            defaultMuted
            loop
            playsInline
            preload={armed ? 'auto' : 'none'}
            width={720}
            height={1280}
            aria-hidden="true"
            onPlay={() => setPlaying(true)}
            onPlaying={() => {
              setPlaying(true);
              setNeedsTap(false);
            }}
            onPause={() => setPlaying(false)}
          />
        )}
        {video && needsTap && (
          <button
            type="button"
            className="vcard-play"
            aria-label={playLabel}
            onClick={onPlayClick}
          >
            <PlayIcon />
          </button>
        )}
        {video && (
          <button
            type="button"
            className="vcard-sound"
            aria-pressed={!muted}
            aria-label={muted ? soundOn : soundOff}
            onClick={toggleSound}
          >
            <SoundIcon on={!muted} />
          </button>
        )}
        <div className="vcard-hit" aria-hidden="true" onClick={() => setOpen((value) => !value)} />
      </div>
      <div className="vcard-overlay">
        {category && <span className="cat">{category}</span>}
        <Title>{title}</Title>
        <p>{description}</p>
        {note && <p className="vcard-note">{note}</p>}
        {script && (
          <details className="vcard-script">
            <summary>{scriptLabel}</summary>
            <p>{script}</p>
          </details>
        )}
        <div className="vcard-actions">
          <a className="btn btn-lime" href={ctaHref} data-umami-event="whatsapp" data-umami-event-place={place}>{ctaLabel}</a>
          {visitHref && (
            <a className="vcard-visit" href={visitHref} target="_blank" rel="noopener noreferrer">
              {visitLabel}
              {visitHint && <span className="sr">{visitHint}</span>}
            </a>
          )}
        </div>
        <span className="sr">{detailsLabel}</span>
      </div>
    </article>
  );
}

function PlayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <path d="M10 7.2v13.6l12-6.8-12-6.8z" fill="currentColor" />
    </svg>
  );
}

function SoundIcon({ on }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 7h2.2L9 4.2v9.6L5.2 11H3V7z" fill="currentColor" />
      {on ? (
        <path d="M11 6.2a4 4 0 0 1 0 5.6M12.8 4.2a6.5 6.5 0 0 1 0 9.6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      ) : (
        <path d="M12 7l4 4M16 7l-4 4" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      )}
    </svg>
  );
}
