import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import api from '../services/api.js';

/**
 * Public gallery: the photos managed from the admin app's Gallery screen
 * (`hero_images`). Clicking a photo opens a keyboard-navigable lightbox.
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
        setImages(Array.isArray(response.data?.hero) ? response.data.hero : []);
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
    <main className="kk-gallery-page min-h-screen bg-[#131315] text-[#E5E1E4]">
      <style>{CSS}</style>

      {/* Header */}
      <section className="relative overflow-hidden border-b border-[#E5E1E4]/10">
        <div aria-hidden="true" className="kk-gallery-glow absolute inset-0" />
        <div className="relative mx-auto max-w-[1240px] px-5 pb-12 pt-16 sm:px-8 lg:pt-20">
          <p className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.3em] text-[#FFE08A]">
            <span className="h-px w-8 bg-[#F5C542]/60" />
            Our gallery
          </p>
          <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <h1 className="max-w-[620px] font-['Fraunces',Georgia,serif] text-[36px] font-bold leading-[1.02] tracking-[-0.035em] sm:text-[46px] lg:text-[54px]">
              Moments from the <em className="not-italic text-[#FFE08A]">Samudai</em>.
            </h1>
            <p className="max-w-[360px] text-[13px] leading-[1.7] text-[#E5E1E4]/60">
              Festivals, film nights, the food festival and the faces that make them. The committee
              adds new photographs from the admin app.
            </p>
          </div>
          <div className="mt-7 flex flex-wrap items-center gap-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#E5E1E4]/45">
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E1E4]/12 bg-[#131315]/50 px-3 py-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#FFE08A]">photo_library</span>
              {loading ? 'Loading…' : `${images.length} photograph${images.length === 1 ? '' : 's'}`}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-[#E5E1E4]/12 bg-[#131315]/50 px-3 py-1.5">
              <span className="material-symbols-outlined text-[14px] text-[#BBCBB6]">verified</span>
              Shot at our events
            </span>
          </div>
        </div>
      </section>

      {/* Grid */}
      <section className="mx-auto max-w-[1240px] px-5 py-12 sm:px-8 lg:py-16">
        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="kk-gallery-skeleton aspect-[4/3] rounded-2xl"
              />
            ))}
          </div>
        ) : images.length === 0 ? (
          <div className="rounded-3xl border border-[#E5E1E4]/10 bg-[#1B1B1D]/50 px-6 py-16 text-center">
            <span className="material-symbols-outlined text-[40px] text-[#FFE08A]/60">add_photo_alternate</span>
            <h2 className="mt-4 font-['Fraunces',Georgia,serif] text-[26px] font-bold">No photographs yet</h2>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-[#E5E1E4]/55">
              The committee adds gallery pictures from the admin app. Check back after the next event.
            </p>
            <Link
              to="/"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#E5E1E4] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#131315] transition-transform hover:-translate-y-0.5"
            >
              Back to the community
              <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {images.map((image, index) => (
              <button
                key={image.id}
                type="button"
                onClick={() => setActive(index)}
                className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-[#F5C542]/18 bg-[#1B1517] text-left transition-all duration-300 hover:border-[#FFE08A]/45 hover:shadow-[0_28px_60px_-34px_rgba(245, 197, 66,0.55)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FFE08A]"
              >
                <img
                  src={image.url}
                  alt={image.caption || `Samudai photograph ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                />
                <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#101012]/85 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 opacity-0 transition-all duration-300 group-hover:opacity-100">
                  <span className="line-clamp-2 text-[11px] font-semibold leading-snug text-[#E5E1E4]">
                    {image.caption || 'Konkani Samudai'}
                  </span>
                  <span className="material-symbols-outlined shrink-0 text-[18px] text-[#FFE08A]">open_in_full</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Join banner */}
      <section className="mx-auto max-w-[1240px] px-5 pb-20 sm:px-8">
        <div className="flex flex-col gap-5 rounded-[24px] border border-[#F5C542]/25 bg-gradient-to-r from-[#F5C542]/[0.09] to-transparent p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="font-['Fraunces',Georgia,serif] text-[24px] font-bold tracking-[-0.02em]">
              Be in the next set of photographs
            </h2>
            <p className="mt-1 text-[12px] text-[#E5E1E4]/60">
              Members get event discounts, priority seats and a place in everything we do.
            </p>
          </div>
          <Link
            to="/#join"
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-gradient-to-r from-[#FFD86B] to-[#F5C542] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#131315] shadow-[0_16px_34px_-20px_rgba(245, 197, 66,1)] transition-transform hover:-translate-y-0.5"
          >
            Become a member
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </Link>
        </div>
      </section>

      {/* Lightbox */}
      {current && (
        <div
          className="fixed inset-0 z-[80] flex flex-col bg-[#101012]/95 p-4 backdrop-blur-md sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Gallery photograph"
          onClick={() => setActive(null)}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#FFE08A]">
                Konkani Samudai · Gallery
              </p>
              <p className="mt-1 truncate font-['Fraunces',Georgia,serif] text-[20px] font-bold">
                {current.caption || 'Photograph'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActive(null)}
              aria-label="Close gallery"
              className="shrink-0 rounded-full border border-[#E5E1E4]/15 p-2.5 text-[#E5E1E4]/70 transition-colors hover:text-[#E5E1E4]"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center py-4" onClick={(event) => event.stopPropagation()}>
            {images.length > 1 && (
              <button
                type="button"
                onClick={() => setActive((index) => (index - 1 + images.length) % images.length)}
                aria-label="Previous photograph"
                className="absolute left-0 z-10 rounded-full border border-[#E5E1E4]/15 bg-[#131315]/70 p-3 text-[#E5E1E4]/80 backdrop-blur transition-colors hover:text-[#FFE08A]"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_left</span>
              </button>
            )}

            <img
              src={current.url}
              alt={current.caption || 'Gallery photograph'}
              className="max-h-full max-w-full rounded-2xl object-contain shadow-[0_30px_80px_-30px_rgba(0,0,0,0.9)]"
            />

            {images.length > 1 && (
              <button
                type="button"
                onClick={() => setActive((index) => (index + 1) % images.length)}
                aria-label="Next photograph"
                className="absolute right-0 z-10 rounded-full border border-[#E5E1E4]/15 bg-[#131315]/70 p-3 text-[#E5E1E4]/80 backdrop-blur transition-colors hover:text-[#FFE08A]"
              >
                <span className="material-symbols-outlined text-[20px]">chevron_right</span>
              </button>
            )}
          </div>

          <p className="text-center text-[10px] font-semibold uppercase tracking-[0.18em] text-[#E5E1E4]/35">
            {active + 1} / {images.length}
          </p>
        </div>
      )}
    </main>
  );
}

const CSS = `
.kk-gallery-page {
  background:
    radial-gradient(980px 520px at 86% -10%, rgba(245, 197, 66, 0.22), transparent 64%),
    radial-gradient(760px 460px at 0% 26%, rgba(255, 224, 138, 0.07), transparent 72%),
    linear-gradient(180deg, #141012 0%, #131315 58%, #100d0f 100%);
}
.kk-gallery-glow {
  background:
    radial-gradient(700px 320px at 18% 0%, rgba(245, 197, 66,0.16), transparent 70%),
    radial-gradient(620px 300px at 88% 10%, rgba(245, 197, 66,0.18), transparent 72%);
}
.kk-gallery-skeleton {
  background: linear-gradient(110deg, rgba(32, 31, 33,0.35) 8%, rgba(32, 31, 33,0.6) 18%, rgba(32, 31, 33,0.35) 33%);
  background-size: 220% 100%;
  animation: kkGalleryShimmer 1.6s linear infinite;
  border: 1px solid rgba(229, 225, 228,0.06);
}
@keyframes kkGalleryShimmer {
  to { background-position-x: -220%; }
}
@media (prefers-reduced-motion: reduce) {
  .kk-gallery-skeleton { animation: none; }
}
`;

