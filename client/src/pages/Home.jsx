import { Fragment, useEffect, useRef, useState } from 'react';
import api, { assetUrl } from '../services/api.js';
import { Link } from 'react-router-dom';

const FALLBACK_POSTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBOo5aPBJ7vdVsyiAG9pfkMVnbOJYOVjsyddb_wdpsXPO4tgUUifaP9nMyjEo-fKxK_ZjauieUWHBTRdqvu8Q4CcOErASg1hSKV9obttLqrrs6jTlTsxDnxRJLtWEC4hmHH1qRKkwdlvckJI1x8oqYkdtQp6GDkqg9I2cHnbuZMEXP4XfOWNlSml_xs9RBxGEFaj-pYqP9suJE5VFC4RFuakypp44Chxara4FwGIgRyLVZSH5AUU610lQ';

const SLIDE_MS = 6000;

/*
  Palette (plain hex, no custom Tailwind tokens needed):
  Sea ink  #0A2A31   page background
  Tide     #123E47   raised surfaces
  Shell    #EFEBE0   primary text / ticket paper
  Kokum    #C2305E   actions
  Mango    #F4B63F   ticket stub
*/
const FONTS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Public+Sans:wght@400;500;600&display=swap');
.kk-display { font-family: 'Fraunces', Georgia, serif; }
.kk-body { font-family: 'Public Sans', system-ui, sans-serif; }

/* Ticket enters from the side you navigated towards */
@keyframes kk-ticket-in { from { opacity: 0; transform: translateX(var(--dir, 0px)) scale(.985); } to { opacity: 1; transform: none; } }
.kk-ticket-in { animation: kk-ticket-in .7s cubic-bezier(.2,.8,.2,1) both; }

/* Poster unmasks left to right */
@keyframes kk-poster-in { from { clip-path: inset(0 100% 0 0 round 12px); transform: scale(1.08); } to { clip-path: inset(0 0 0 0 round 12px); transform: none; } }
.kk-poster-in { animation: kk-poster-in .9s cubic-bezier(.2,.8,.2,1) both; }

/* Title words slide up out of a mask */
.kk-mask { display: inline-block; overflow: hidden; vertical-align: top; padding-bottom: .1em; }
.kk-word { display: inline-block; animation: kk-word .8s cubic-bezier(.2,.8,.2,1) both; }
@keyframes kk-word { from { transform: translateY(110%) rotate(5deg); } to { transform: none; } }

@keyframes kk-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.kk-rise { animation: kk-rise .6s cubic-bezier(.2,.8,.2,1) both; }

/* Side tickets slide out from behind the main ticket */
@keyframes kk-side-in { from { opacity: 0; transform: translateX(var(--from, 0px)); } to { opacity: 1; transform: none; } }
.kk-side { animation: kk-side-in .6s cubic-bezier(.2,.8,.2,1) .15s both; }

@keyframes kk-ping { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(2.6); opacity: 0; } }
.kk-ping { animation: kk-ping 1.6s ease-out infinite; }

/* Ambient blurred backdrop crossfade */
@keyframes kk-backdrop { from { opacity: 0; transform: scale(1.35); } to { opacity: .28; transform: scale(1.2); } }
.kk-backdrop { animation: kk-backdrop 1.4s ease-out both; }

/* Autoplay progress on the active thumbnail */
@keyframes kk-progress { from { width: 0; } to { width: 100%; } }
.kk-progress { animation: kk-progress ${SLIDE_MS}ms linear both; }

/* Book button: shimmer sweep + soft pulse */
@keyframes kk-pulse { 0% { box-shadow: 0 0 0 0 rgba(194,48,94,.55); } 70%,100% { box-shadow: 0 0 0 14px rgba(194,48,94,0); } }
.kk-btn { position: relative; overflow: hidden; animation: kk-pulse 2.6s ease-out infinite; transition: transform .2s ease, background-color .2s ease; }
.kk-btn:hover { transform: translateY(-2px) scale(1.02); animation-play-state: paused; }
.kk-btn::after { content: ''; position: absolute; inset: 0; background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.45) 50%, transparent 65%); transform: translateX(-120%); }
.kk-btn:hover::after { transform: translateX(120%); transition: transform .8s ease; }

/* Perforation notches gently breathe */
@keyframes kk-dash { to { background-position: 16px 0; } }

/* Scroll reveal */
.kk-reveal { opacity: 0; transform: translateY(28px) scale(.97); transition: opacity .7s cubic-bezier(.2,.8,.2,1), transform .7s cubic-bezier(.2,.8,.2,1); }
.kk-reveal.is-in { opacity: 1; transform: none; }

/* Poster cards */
.kk-card .kk-shine { position: absolute; inset: 0; background: linear-gradient(110deg, transparent 40%, rgba(255,255,255,.28) 50%, transparent 60%); transform: translateX(-130%); pointer-events: none; }
.kk-card:hover .kk-shine { transform: translateX(130%); transition: transform .9s ease; }
.kk-card .kk-cta { transform: translateY(110%); transition: transform .35s cubic-bezier(.2,.8,.2,1); }
.kk-card:hover .kk-cta, .kk-card:focus-visible .kk-cta { transform: none; }

/* Skeleton shimmer */
@keyframes kk-shimmer { from { background-position: -200% 0; } to { background-position: 200% 0; } }
.kk-skeleton { background: linear-gradient(100deg, #123E47 30%, #1a525d 50%, #123E47 70%); background-size: 200% 100%; animation: kk-shimmer 1.6s linear infinite; }

/* Promise icons */
@keyframes kk-ring { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 88; } }
@keyframes kk-scan { 0%,100% { transform: translateY(0); } 50% { transform: translateY(26px); } }
@keyframes kk-spin { to { transform: rotate(360deg); } }
@keyframes kk-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.kk-ring { stroke-dasharray: 88; animation: kk-ring 8s linear infinite; transform-origin: center; transform: rotate(-90deg); }
.kk-scan { animation: kk-scan 2.2s ease-in-out infinite; }
.kk-spin { transform-origin: 24px 24px; animation: kk-spin 14s linear infinite; }
.kk-float { animation: kk-float 3s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .kk-ping, .kk-ticket-in, .kk-side, .kk-poster-in, .kk-word, .kk-rise, .kk-backdrop, .kk-progress, .kk-btn,
  .kk-skeleton, .kk-ring, .kk-scan, .kk-spin, .kk-float { animation: none !important; }
  .kk-backdrop { opacity: .28; }
  .kk-reveal { opacity: 1; transform: none; transition: none; }
  .kk-card .kk-shine { display: none; }
}
`;

const prefersReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/* Fades and lifts children in once they scroll into view */
function Reveal({ children, delay = 0, className = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window) || prefersReduced()) {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`kk-reveal ${shown ? 'is-in' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

/* Poster that tilts towards the pointer with a moving glare */
function Tilt({ children, className = '' }) {
  const ref = useRef(null);

  const onMove = (e) => {
    if (prefersReduced() || e.pointerType === 'touch') return;
    const el = ref.current;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateY(${(x - 0.5) * 12}deg) rotateX(${(0.5 - y) * 12}deg) scale(1.03)`;
    el.style.setProperty('--gx', `${x * 100}%`);
    el.style.setProperty('--gy', `${y * 100}%`);
    el.style.setProperty('--glare', '1');
  };
  const onLeave = () => {
    const el = ref.current;
    el.style.transform = '';
    el.style.setProperty('--glare', '0');
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`relative transition-transform duration-300 ease-out will-change-transform ${className}`}
    >
      {children}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-xl transition-opacity duration-300"
        style={{
          opacity: 'var(--glare, 0)',
          background: 'radial-gradient(circle at var(--gx, 50%) var(--gy, 50%), rgba(255,255,255,.35), transparent 55%)',
        }}
      />
    </div>
  );
}

/* Title words slide up one after another */
const Words = ({ text }) =>
  text.split(' ').map((w, i) => (
    <Fragment key={i}>
      <span className="kk-mask">
        <span className="kk-word" style={{ animationDelay: `${180 + i * 80}ms` }}>
          {w}
        </span>
      </span>{' '}
    </Fragment>
  ));

function useCountUp(target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (prefersReduced()) {
      setValue(target);
      return;
    }
    let raf;
    let start;
    const tick = (ts) => {
      start ??= ts;
      const p = Math.min((ts - start) / 700, 1);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

const PromiseIcon = ({ kind }) => {
  const common = { width: 48, height: 48, viewBox: '0 0 48 48', fill: 'none', 'aria-hidden': true };
  if (kind === 'hold')
    return (
      <svg {...common}>
        <circle cx="24" cy="24" r="14" stroke="#EFEBE0" strokeOpacity=".2" strokeWidth="3" />
        <circle className="kk-ring" cx="24" cy="24" r="14" stroke="#F4B63F" strokeWidth="3" strokeLinecap="round" />
        <path d="M24 17v7l4 3" stroke="#EFEBE0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  if (kind === 'qr')
    return (
      <svg {...common}>
        <g stroke="#EFEBE0" strokeWidth="2.5" strokeLinejoin="round">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <rect x="28" y="8" width="12" height="12" rx="2" />
          <rect x="8" y="28" width="12" height="12" rx="2" />
        </g>
        <path d="M28 28h4v4h-4zM36 36h4v4h-4zM36 28h4M28 36h4" stroke="#EFEBE0" strokeWidth="2.5" />
        <rect className="kk-scan" x="6" y="9" width="36" height="3" rx="1.5" fill="#C2305E" />
      </svg>
    );
  return (
    <svg {...common}>
      <g className="kk-float">
        <g className="kk-spin">
          <path
            d="M24 6l5.2 11 12 1.6-8.8 8.3 2.2 11.9L24 32.8 13.4 38.8l2.2-11.9L6.8 18.6 18.8 17z"
            fill="#F4B63F"
          />
        </g>
      </g>
    </svg>
  );
};

/* Smaller ticket that peeks out from behind the main one (previous / next film) */
function SideTicket({ movie, side, poster, onClick }) {
  if (!movie) return null;
  const left = side === 'left';
  return (
    <div className={`relative w-10 shrink-0 sm:w-24 lg:w-36 ${left ? '-mr-4' : '-ml-4'}`}>
      <button
        key={movie.id}
        onClick={onClick}
        aria-label={`${left ? 'Previous' : 'Next'} movie: ${movie.title}`}
        style={{ '--from': left ? '36px' : '-36px' }}
        className={`kk-side group absolute inset-x-0 inset-y-[14%] overflow-hidden border-2 border-dashed border-[#EFEBE0]/30 bg-[#123E47] text-left transition-transform duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F4B63F] ${
          left ? 'rounded-l-2xl hover:-translate-x-2' : 'rounded-r-2xl hover:translate-x-2'
        }`}
      >
        <img
          src={poster}
          alt=""
          draggable={false}
          className="h-full w-full object-cover opacity-55 transition duration-500 group-hover:scale-105 group-hover:opacity-90"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-[#0A2A31] via-[#0A2A31]/30 to-transparent" />
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className={`absolute top-1/2 h-5 w-5 -translate-y-1/2 text-[#EFEBE0] ${left ? 'left-1.5' : 'right-1.5'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={left ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
        </svg>
        <span className="absolute inset-x-0 bottom-0 hidden p-3 sm:block">
          <span className="block text-xs text-[#EFEBE0]/70">{left ? 'Previous' : 'Next'}</span>
          <span className="kk-display line-clamp-2 text-sm font-bold leading-tight text-[#EFEBE0]">{movie.title}</span>
        </span>
      </button>
    </div>
  );
}

/* A film counts as new if the API says so (is_new) or it was released/added in the last 30 days */
const NEW_DAYS = 30;
const isNew = (m) => {
  if (typeof m.is_new === 'boolean') return m.is_new;
  const t = Date.parse(m.release_date || m.created_at || '');
  return Number.isFinite(t) && Date.now() - t < NEW_DAYS * 86400000;
};

const NewTag = () => (
  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#C2305E] px-2.5 py-0.5 text-xs font-semibold text-white shadow-md shadow-black/30">
    <span className="relative flex h-2 w-2">
      <span className="kk-ping absolute inline-flex h-full w-full rounded-full bg-white" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
    </span>
    New show
  </span>
);

const Meta = ({ children }) => (
  <span className="inline-flex items-center rounded-full border border-[#EFEBE0]/25 px-2.5 py-0.5 text-xs text-[#EFEBE0]/80">
    {children}
  </span>
);

export default function Home() {
  const [movies, setMovies] = useState([]);
  const [current, setCurrent] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const railRef = useRef(null);

  useEffect(() => {
    api.get('/movies').then((r) => setMovies(r.data)).catch(console.error);
  }, []);

  // Keep the active thumbnail visible inside the rail (horizontal only)
  useEffect(() => {
    const tab = railRef.current?.querySelector('[aria-selected="true"]');
    tab?.scrollIntoView?.({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [current]);

  const go = (i) => {
    if (!movies.length) return;
    const next = (i + movies.length) % movies.length;
    setDir(next >= current ? 1 : -1);
    setCurrent(next);
  };
  const step = (d) => {
    if (!movies.length) return;
    setDir(d);
    setCurrent((c) => (c + d + movies.length) % movies.length);
  };

  // Arrow keys move through the films
  useEffect(() => {
    const onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [movies.length]);

  // Trackpad horizontal scroll and swipe/drag
  const lastWheel = useRef(0);
  const startX = useRef(null);
  const onWheel = (e) => {
    if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
    const now = Date.now();
    if (now - lastWheel.current < 700) return;
    lastWheel.current = now;
    step(e.deltaX > 0 ? 1 : -1);
  };
  const onDown = (e) => {
    startX.current = e.clientX;
  };
  const onUp = (e) => {
    if (startX.current == null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1);
  };

  const featured = movies[current];
  const prevMovie = movies.length > 1 ? movies[(current - 1 + movies.length) % movies.length] : null;
  const nextMovie = movies.length > 1 ? movies[(current + 1) % movies.length] : null;
  const posterOf = (m) => assetUrl(m.thumbnail_url) || FALLBACK_POSTER;
  const filmCount = useCountUp(movies.length);

  return (
    <div className="kk-body min-h-screen bg-[#0A2A31] text-[#EFEBE0]">
      <style>{FONTS}</style>

      {/* FEATURED TICKET */}
      <div className="relative overflow-hidden">
        {/* Blurred poster glow that crossfades with the film */}
        {featured && (
          <>
            <img
              key={`bg-${featured.id}`}
              src={posterOf(featured)}
              alt=""
              aria-hidden="true"
              className="kk-backdrop pointer-events-none absolute inset-0 h-full w-full object-cover blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-[#0A2A31]/40 to-[#0A2A31]"
            />
          </>
        )}

        <section
          className="relative mx-auto max-w-6xl px-4 pb-14 pt-8 sm:px-6"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          <p className="kk-rise mb-6 max-w-md text-sm text-[#EFEBE0]/75">
            Pick your seats on a live map, hold them while you pay, and walk in with a QR ticket.
          </p>

          {featured ? (
            <div
              className="flex touch-pan-y select-none items-stretch"
              onWheel={onWheel}
              onPointerDown={onDown}
              onPointerUp={onUp}
              onPointerLeave={() => (startX.current = null)}
              onDragStart={(e) => e.preventDefault()}
            >
            <SideTicket side="left" movie={prevMovie} poster={prevMovie && posterOf(prevMovie)} onClick={() => step(-1)} />
            <div
              key={featured.id}
              style={{ '--dir': `${dir * 48}px` }}
              className="kk-ticket-in relative z-10 flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl shadow-2xl shadow-black/40 md:flex-row"
            >
              {/* Main ticket body */}
              <div className="relative flex flex-1 gap-4 bg-[#EFEBE0] p-4 text-[#0A2A31] sm:gap-6 sm:p-8 md:items-stretch">
                <Tilt className="w-24 shrink-0 self-start sm:w-40 md:w-56 lg:w-64">
                  <img
                    src={posterOf(featured)}
                    alt={`Poster for ${featured.title}`}
                    className="kk-poster-in aspect-[3/4] w-full rounded-xl object-cover shadow-xl"
                  />
                </Tilt>
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-4 sm:gap-6">
                  <div>
                    <p
                      className="kk-rise flex flex-wrap items-center gap-2 text-sm font-semibold text-[#C2305E]"
                      style={{ animationDelay: '120ms' }}
                    >
                      Now showing
                      {isNew(featured) && <NewTag />}
                    </p>
                    <h1 className="kk-display mt-2 text-2xl font-black leading-[1.05] sm:text-4xl md:text-5xl lg:text-6xl">
                      <Words text={featured.title} />
                    </h1>
                    <p
                      className="kk-rise mt-3 line-clamp-3 max-w-md text-xs leading-relaxed text-[#0A2A31]/75 sm:mt-4 sm:line-clamp-4 sm:text-sm"
                      style={{ animationDelay: '520ms' }}
                    >
                      {featured.synopsis || 'Synopsis coming soon.'}
                    </p>
                  </div>

                </div>
              </div>

              {/* Perforation with notches */}
              <div aria-hidden="true" className="relative h-0 md:h-auto md:w-0">
                <div className="absolute -top-3 left-0 h-6 w-6 rounded-full bg-[#0A2A31] md:-left-3 md:top-0 md:-translate-y-1/2" />
                <div className="absolute -bottom-3 right-0 h-6 w-6 rounded-full bg-[#0A2A31] md:-left-3 md:bottom-0 md:right-auto md:translate-y-1/2" />
              </div>

              {/* Stub */}
              <div className="flex flex-col justify-between gap-6 border-t-2 border-dashed border-[#0A2A31]/40 bg-[#F4B63F] p-6 text-[#0A2A31] md:w-64 md:border-l-2 md:border-t-0">
                <dl className="space-y-4 text-sm">
                  {[
                    ['Language', featured.language || 'English'],
                    ['Runtime', `${featured.duration_minutes || 120} min`],
                    ['Genre', featured.genre || 'Drama'],
                    ['Release', featured.release_date ? new Date(featured.release_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'TBA'],
                  ].map(([label, value], i) => (
                    <div key={label} className="kk-rise" style={{ animationDelay: `${350 + i * 90}ms` }}>
                      <dt className="text-xs font-medium text-[#0A2A31]/65">{label}</dt>
                      <dd className="kk-display text-xl font-bold">{value}</dd>
                    </div>
                  ))}
                </dl>
                <Link
                  to={`/movies/${featured.slug || featured.id}`}
                  className="kk-btn rounded-xl bg-[#C2305E] px-5 py-3 text-center text-sm font-semibold text-white hover:bg-[#a82651] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0A2A31]"
                >
                  Book seats
                </Link>
              </div>
            </div>
            </div>
          ) : (
            <div className="kk-skeleton h-[420px] rounded-3xl" />
          )}

          {/* Poster rail selects the featured film; the bar shows time until the next one */}
          {movies.length > 1 && (
            <div
              ref={railRef}
              className="mt-5 flex gap-3 overflow-x-auto px-1 pb-2 pt-1"
              role="tablist"
              aria-label="Choose a movie"
            >
              {movies.map((m, i) => {
                const active = i === current;
                return (
                  <button
                    key={m.id}
                    role="tab"
                    aria-selected={active}
                    aria-label={m.title}
                    onClick={() => go(i)}
                    className={`relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-lg transition-all duration-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#F4B63F] ${
                      active
                        ? '-translate-y-1 scale-105 ring-2 ring-[#F4B63F]'
                        : 'opacity-50 hover:-translate-y-0.5 hover:opacity-100'
                    }`}
                  >
                    <img src={posterOf(m)} alt="" className="h-full w-full object-cover" />
                    {active && (
                      <span
                        key={`p-${current}`}
                        className="kk-progress absolute bottom-0 left-0 h-1 bg-[#F4B63F]"
                        style={{ animationPlayState: paused ? 'paused' : 'running' }}
                        onAnimationEnd={() => step(1)}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* NOW SHOWING */}
      <main id="movies" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <Reveal>
          <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-[#EFEBE0]/15 pb-4">
            <h2 className="kk-display text-3xl font-bold">Now showing</h2>
            <p className="text-sm tabular-nums text-[#EFEBE0]/60">
              {filmCount} {movies.length === 1 ? 'film' : 'films'}
            </p>
          </div>
        </Reveal>

        {movies.length === 0 && <p className="text-[#EFEBE0]/60">No movies are published yet. Check back soon.</p>}

        <div className="grid grid-cols-2 gap-x-5 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
          {movies.map((m, i) => (
            <Reveal key={m.id} delay={(i % 4) * 90}>
              <Link
                to={`/movies/${m.slug || m.id}`}
                className="kk-card group block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#F4B63F]"
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-[#123E47] transition duration-300 group-hover:-translate-y-1.5 group-hover:shadow-2xl group-hover:shadow-black/50">
                  <img
                    src={posterOf(m)}
                    alt={`Poster for ${m.title}`}
                    loading="lazy"
                    className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-700 group-hover:scale-110"
                  />
                  <span className="kk-shine" aria-hidden="true" />
                  <span className="absolute left-2 top-2 rounded bg-[#F4B63F] px-1.5 py-0.5 text-xs font-bold text-[#0A2A31]">
                    {m.certification || 'UA'}
                  </span>
                  {isNew(m) && (
                    <span className="absolute bottom-2 left-2 transition-opacity duration-200 group-hover:opacity-0">
                      <NewTag />
                    </span>
                  )}
                  <span className="kk-cta absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#C2305E] to-[#C2305E]/85 py-3 text-center text-sm font-semibold text-white">
                    Book seats
                  </span>
                </div>
                <h3 className="kk-display mt-3 text-lg font-bold leading-tight transition-colors duration-200 group-hover:text-[#F4B63F]">
                  {m.title}
                </h3>
                <p className="mt-1 text-xs text-[#EFEBE0]/60">
                  {m.language || 'English'}, {m.duration_minutes || 120} min, {m.genre || 'Drama'}
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </main>

      {/* PROMISES */}
      <section className="bg-[#123E47] py-14">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 md:grid-cols-3">
          {[
            { icon: 'hold', title: 'Seats held for 8 minutes', desc: 'Once you pick seats, nobody else can book them while you check out.' },
            { icon: 'qr', title: 'QR ticket on your phone', desc: 'Scan at the turnstile from your wallet or the SMS link.' },
            { icon: 'star', title: 'Club Samudai rewards', desc: 'Every ticket earns popcorn upgrades and early pick of premium seats.' },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i * 120}>
              <PromiseIcon kind={f.icon} />
              <h4 className="kk-display mt-4 text-xl font-bold text-[#F4B63F]">{f.title}</h4>
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-[#EFEBE0]/75">{f.desc}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#071E23] text-sm text-[#EFEBE0]/65">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {[
              { h: 'Cinemas', items: ['City Mall, Mangaluru', 'Samudai Plaza, Udupi', 'Panaji Heritage Screen, Goa'] },
              { h: 'Experiences', items: ['Konkani Film Festival', 'Dolby Atmos Prime', 'VIP Recliner Lounges'] },
              { h: 'Help', items: ['Cancellation & refunds', 'Food & beverages menu', 'Privacy policy'] },
            ].map((col) => (
              <div key={col.h}>
                <h5 className="kk-display mb-3 text-base font-bold text-[#EFEBE0]">{col.h}</h5>
                <ul className="space-y-2">
                  {col.items.map((t) => (
                    <li key={t}>
                      <a href="#" className="inline-block transition duration-200 hover:translate-x-1 hover:text-[#F4B63F]">
                        {t}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <div className="col-span-2 md:col-span-1">
              <h5 className="kk-display mb-3 text-base font-bold text-[#EFEBE0]">Get release alerts</h5>
              <p className="mb-3">Be first to know when new Konkani films open.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  aria-label="Email address"
                  placeholder="Email address"
                  className="w-full rounded-lg border border-[#EFEBE0]/20 bg-transparent px-3 py-2 text-[#EFEBE0] transition placeholder:text-[#EFEBE0]/40 focus:border-[#F4B63F] focus:outline-none focus:ring-2 focus:ring-[#F4B63F]/30"
                />
                <button className="rounded-lg bg-[#F4B63F] px-4 py-2 font-semibold text-[#0A2A31] transition duration-200 hover:-translate-y-0.5 hover:bg-[#f7c565] active:translate-y-0">
                  Join
                </button>
              </div>
            </div>
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#EFEBE0]/10 pt-6 sm:flex-row">
            <p>© 2025 Konkani Samudai Theatres Pvt Ltd. All rights reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="transition-colors hover:text-[#F4B63F]">Terms of service</a>
              <a href="#" className="transition-colors hover:text-[#F4B63F]">Security</a>
              <a href="#" className="transition-colors hover:text-[#F4B63F]">Sitemap</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}