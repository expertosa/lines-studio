'use client';

import { useEffect, useId, useRef, useState } from 'react';

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
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [shown, setShown] = useState(!defer);
  const still = poster || image;
  const Title = heading === 'h3' ? 'h3' : 'h2';

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
    const el = videoRef.current;
    if (!box || !el) return undefined;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    el.muted = true;
    el.defaultMuted = true;
    el.setAttribute('muted', '');

    function arm() {
      if (el.getAttribute('src')) return;
      el.preload = 'metadata';
      el.src = video;
    }
    function play() {
      if (motion.matches) return;
      arm();
      const pending = el.play();
      if (pending) pending.catch(() => {});
    }
    function pause() {
      if (!el.paused) el.pause();
    }
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.5) play();
      else pause();
    }, { threshold: [0, 0.5, 0.75] });
    observer.observe(box);
    const onMotion = () => { if (motion.matches) pause(); };
    motion.addEventListener('change', onMotion);
    return () => {
      observer.disconnect();
      motion.removeEventListener('change', onMotion);
      pause();
    };
  }, [video]);

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
      if (!el.getAttribute('src')) {
        el.preload = 'metadata';
        el.src = video;
      }
      const pending = el.play();
      if (pending) pending.catch(() => {});
    }
    el.muted = nextMuted;
    setMuted(nextMuted);
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
            data-src={video}
            muted
            defaultMuted
            loop
            playsInline
            preload="none"
            width={720}
            height={1280}
            aria-hidden="true"
            onPlaying={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
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
