import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import api from '../services/api.js';
import UiIcon from '../components/UiIcon.jsx';

/**
 * Public gallery: photographs managed from the admin app's Gallery screen.
 * Clicking a photograph opens a keyboard-navigable lightbox.
 */
export default function Gallery() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(null);

  useEffect(() => {
    let stop = false;
    api
      .get('/community')
      .then((response) => {
        if (stop) return;
        const data = response.data || {};
        setImages(
          Array.isArray(data.gallery) && data.gallery.length
            ? data.gallery
            : Array.isArray(data.hero)
              ? data.hero
              : [],
        );
      })
      .catch(() => {
        if (!stop) setImages([]);
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (active == null) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') setActive(null);
      if (event.key === 'ArrowRight') setActive((index) => (index + 1) % images.length);
      if (event.key === 'ArrowLeft') setActive((index) => (index - 1 + images.length) % images.length);
    };

    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [active, images.length]);

  const current = active != null ? images[active] : null;

  return (
    <main className="gallery-page">
      <style>{CSS}</style>

      <header className="g-head">
        <div className="kk-wrap">
          <div className="g-head__grid">
            <h1 className="kk-h1">
              Moments from
              <br />
              the Samudai<span>.</span>
            </h1>
            <p className="kk-lede">
              Festivals, film nights, the food festival and the faces that make them. The
              committee adds new photographs from the admin room after every gathering.
            </p>
          </div>
          <div className="g-meta">
            <span>{loading ? 'Loading photographs' : `${images.length} photographs`}</span>
            <span className="g-meta__dot" aria-hidden="true" />
            <span>Shot at our events</span>
            <Link to="/" className="kk-link g-meta__link">
              Back to the house
              <UiIcon name="arrow_forward" className="text-[13px]" />
            </Link>
          </div>
        </div>
      </header>

      <section className="kk-wrap g-body">
        {loading ? (
          <div className="g-grid">
            {Array.from({ length: 7 }).map((_, index) => (
              <div
                key={index}
                className={`g-skeleton${index === 0 ? ' g-skeleton--lead' : ''}`}
              />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="g-empty">
            <p className="kk-eyebrow">A quiet archive</p>
            <h2 className="kk-h2">No photographs yet.</h2>
            <p className="kk-lede">
              The committee adds pictures from the admin room. Check back after the next event.
            </p>
            <Link to="/" className="btn ghost">
              Back to the house
            </Link>
          </div>
        ) : (
          <div className="g-grid">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActive(index)}
                className={`g-photo g-photo--${index + 1}`}
                aria-label={`Open photograph ${index + 1} of ${images.length}`}
              >
                <img
                  src={image.url}
                  alt={image.caption || `Konkani Samudai photograph ${index + 1}`}
                  loading="lazy"
                />
                <span className="g-photo__index" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="g-photo__hint" aria-hidden="true">
                  <UiIcon name="open_in_full" className="text-[16px]" />
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="kk-wrap g-join">
        <div>
          <h2 className="kk-h2">Be in the next set of photographs.</h2>
          <p className="kk-lede">
            Members get event discounts, priority film-night seats and a place in everything the
            Samudai does.
          </p>
        </div>
        <Link to="/#join" className="btn">
          Become a member
          <UiIcon name="arrow_forward" className="text-[14px]" />
        </Link>
      </section>

      {current && (
        <div
          className="g-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery photograph"
          onClick={() => setActive(null)}
        >
          <div className="g-lightbox__bar">
            <div>
              <p>The archive · Konkani Samudai</p>
              <strong>{String(active + 1).padStart(2, '0')} / {String(images.length).padStart(2, '0')}</strong>
            </div>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close gallery"
              className="nav-icon"
            >
              <UiIcon name="close" className="text-[20px]" />
            </button>
          </div>

          <div className="g-lightbox__stage" onClick={(event) => event.stopPropagation()}>
            {images.length > 1 && (
              <button
                type="button"
                onClick={() => setActive((index) => (index - 1 + images.length) % images.length)}
                aria-label="Previous photograph"
                className="g-lightbox__nav g-lightbox__nav--prev"
              >
                <UiIcon name="chevron_left" className="text-[22px]" />
              </button>
            )}

            <img src={current.url} alt={current.caption || 'Gallery photograph'} />

            {images.length > 1 && (
              <button
                type="button"
                onClick={() => setActive((index) => (index + 1) % images.length)}
                aria-label="Next photograph"
                className="g-lightbox__nav g-lightbox__nav--next"
              >
                <UiIcon name="chevron_right" className="text-[22px]" />
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

const CSS = `
.gallery-page { min-height: 100vh; background: var(--ink); color: var(--text); }

.g-head { border-bottom: 1px solid var(--line); }
.g-head > .kk-wrap { padding-block: clamp(40px, 5vw, 72px) clamp(26px, 3vw, 40px); }
.g-head__grid {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr);
  gap: clamp(28px, 5vw, 70px);
  align-items: end;
  margin-top: 22px;
}
.g-head h1 span { color: var(--brass); }
.g-head__grid .kk-lede { padding-bottom: 6px; }
.g-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted-2);
}
.g-meta__dot { width: 3px; height: 3px; border-radius: 50%; background: var(--brass); }
.g-meta__link { margin-left: auto; }

.g-body { padding-block: clamp(30px, 4vw, 54px); }
.g-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-auto-rows: clamp(150px, 15.5vw, 214px);
  gap: 10px;
}
.g-photo {
  position: relative;
  overflow: hidden;
  border: 1px solid transparent;
  background: var(--ink-3);
  transition: border-color 0.25s ease;
}
.g-photo--1 { grid-column: span 2; grid-row: span 2; }
.g-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(0.92);
  transition: transform 0.8s cubic-bezier(0.22, 0.61, 0.36, 1), filter 0.3s ease;
}
.g-photo:hover { border-color: rgba(200, 255, 31, 0.55); }
.g-photo:hover img { transform: scale(1.035); filter: saturate(1); }
.g-photo__index {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: grid;
  place-items: center;
  min-width: 30px;
  height: 26px;
  padding-inline: 7px;
  background: rgba(20, 24, 27, 0.78);
  font-family: var(--font-display);
  font-size: 11px;
  color: var(--brass);
}
.g-photo__hint {
  position: absolute;
  right: 10px;
  bottom: 10px;
  display: grid;
  place-items: center;
  width: 28px;
  height: 26px;
  background: rgba(20, 24, 27, 0.78);
  color: var(--text);
  opacity: 0;
  transition: opacity 0.25s ease;
}
.g-photo:hover .g-photo__hint { opacity: 1; }

.g-skeleton {
  background: var(--ink-3);
  border: 1px solid var(--line);
  animation: g-pulse 1.5s ease-in-out infinite;
}
.g-skeleton--lead { grid-column: span 2; grid-row: span 2; }
@keyframes g-pulse { 0%, 100% { opacity: 0.55; } 50% { opacity: 1; } }

.g-empty {
  display: grid;
  justify-items: start;
  gap: 14px;
  padding-block: clamp(50px, 8vw, 100px);
  border-block: 1px solid var(--line);
}

.g-join {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 30px;
  padding-block: clamp(36px, 4.5vw, 60px);
  border-top: 1px solid var(--line);
}
.g-join .kk-lede { margin-top: 12px; max-width: 46ch; }

.g-lightbox {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  flex-direction: column;
  background: #14181B;
}
.g-lightbox__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 16px var(--gutter);
  border-bottom: 1px solid var(--line);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--muted);
}
.g-lightbox__bar strong { color: var(--brass); font-weight: 700; }
.g-lightbox__stage {
  position: relative;
  display: flex;
  min-height: 0;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 44px);
}
.g-lightbox__stage img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.g-lightbox__nav {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border: 1px solid var(--line-strong);
  background: rgba(20, 24, 27, 0.8);
  color: var(--text);
  transform: translateY(-50%);
  transition: border-color 0.2s ease, color 0.2s ease;
}
.g-lightbox__nav:hover { border-color: var(--brass); color: var(--brass); }
.g-lightbox__nav--prev { left: clamp(10px, 3vw, 30px); }
.g-lightbox__nav--next { right: clamp(10px, 3vw, 30px); }

@media (max-width: 900px) {
  .g-head__grid { grid-template-columns: 1fr; align-items: start; gap: 20px; }
  .g-meta__link { margin-left: 0; }
  .g-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .g-join { flex-direction: column; align-items: flex-start; }
}
@media (max-width: 640px) {
  .g-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-rows: 136px; gap: 8px; }
  .g-photo--1 { grid-column: span 2; grid-row: span 2; }
  .g-lightbox__nav { width: 38px; height: 38px; }
  .g-lightbox__stage { padding: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .g-photo img { transition: none; }
  .g-photo:hover img { transform: none; }
  .g-skeleton { animation: none; }
}
`;
