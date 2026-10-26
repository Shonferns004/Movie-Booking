
import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import api, { assetUrl } from '../services/api.js';

gsap.registerPlugin(ScrollTrigger);

const FALLBACK_POSTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBOo5aPBJ7vdVsyiAG9pfkMVnbOJYOVjsyddb_wdpsXPO4tgUUifaP9nMyjEo-fKxK_ZjauieUWHBTRdqvu8Q4CcOErASg1hSKV9obttLqrrs6jTlTsxDnxRJLtWEC4hmHH1qRKkwdlvckJI1x8oqYkdtQp6GDkqg9I2cHnbuZMEXP4XfOWNlSml_xs9RBxGEFaj-pYqP9suJE5VFC4RFuakypp44Chxara4FwGIgRyLVZSH5AUU610lQ';

const STYLES = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Public+Sans:wght@400;500;600;700&display=swap');

.md-display { font-family: 'Fraunces', Georgia, serif; }
.md-body { font-family: 'Public Sans', system-ui, sans-serif; }

.md-backdrop {
  animation: md-backdrop-in 1.2s ease-out both;
}
@keyframes md-backdrop-in {
  from { opacity: 0; transform: scale(1.3); }
  to { opacity: .25; transform: scale(1.1); }
}

.md-poster {
  animation: md-poster-in .9s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes md-poster-in {
  from { opacity: 0; transform: translateY(20px) rotate(-2deg); }
  to { opacity: 1; transform: translateY(0) rotate(0); }
}

.md-ticket {
  transition: transform .3s ease, border-color .3s ease, box-shadow .3s ease;
}
.md-ticket:hover {
  transform: translateY(-5px);
  border-color: rgba(244,182,63,.6);
  box-shadow: 0 20px 45px rgba(0,0,0,.24);
}

.md-book {
  position: relative;
  overflow: hidden;
  transition: background-color .2s ease, transform .2s ease;
}
.md-book:hover {
  background-color: #a82651;
  transform: translateY(-2px);
}
.md-book::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.35) 50%, transparent 65%);
  transform: translateX(-120%);
  transition: transform .7s ease;
}
.md-book:hover::after { transform: translateX(120%); }

.md-reveal {
  opacity: 0;
  transform: translateY(22px);
}
.md-divider {
  border-top: 2px dashed rgba(10,42,49,.38);
}

@media (prefers-reduced-motion: reduce) {
  .md-backdrop, .md-poster { animation: none !important; }
  .md-ticket, .md-book { transition: none !important; }
}
`;

function formatShowtime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: 'Date unavailable', time: 'Time unavailable' };

  return {
    date: date.toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
    time: date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

function Meta({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#0A2A31]/20 px-3 py-1 text-xs font-semibold text-[#0A2A31]/75">
      {children}
    </span>
  );
}

function ShowTicket({ show, index }) {
  const { date, time } = formatShowtime(show.starts_at);
  const status = show.status || 'Scheduled';
  const available = ['scheduled', 'active'].includes(status.toLowerCase());

  return (
    <article
      className="md-ticket overflow-hidden rounded-2xl border border-[#EFEBE0]/15 bg-[#123E47]"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[.16em] text-[#EFEBE0]/60">
          <span className="h-2 w-2 rounded-full bg-[#F4B63F]" />
          Screening {String(index + 1).padStart(2, '0')}
        </span>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
          available
            ? 'bg-[#F4B63F]/15 text-[#F4B63F]'
            : 'bg-[#EFEBE0]/10 text-[#EFEBE0]/65'
        }`}>
          {status}
        </span>
      </div>

      <div className="px-5 pb-5 pt-5">
        <p className="text-xs font-medium text-[#EFEBE0]/55">SCREENING DATE</p>
        <p className="md-display mt-1 text-xl font-bold text-[#EFEBE0]">
          {date}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#0A2A31] text-[#F4B63F]">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </div>
          <div>
            <p className="text-xs text-[#EFEBE0]/55">STARTS AT</p>
            <p className="md-display text-2xl font-bold text-[#F4B63F]">{time}</p>
          </div>
        </div>
      </div>

      <div className="md-divider" />

      <div className="flex items-center justify-between gap-3 bg-[#EFEBE0] p-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.15em] text-[#0A2A31]/55">
            Your next movie night
          </p>
          <p className="md-display mt-1 text-sm font-bold text-[#0A2A31]">
            {available ? 'Choose your seats' : 'Booking may be unavailable'}
          </p>
        </div>
        {available ? (
          <Link
            to={`/shows/${show.id}/seats`}
            className="md-book shrink-0 rounded-xl bg-[#C2305E] px-4 py-3 text-sm font-bold text-white"
          >
            Select seats <span aria-hidden="true">↗</span>
          </Link>
        ) : (
          <span className="shrink-0 rounded-xl bg-[#0A2A31]/10 px-3 py-2 text-xs font-semibold text-[#0A2A31]/60">
            Unavailable
          </span>
        )}
      </div>
    </article>
  );
}

export default function MovieDetails() {
  const { id } = useParams();
  const [movie, setMovie] = useState(null);
  const [shows, setShows] = useState([]);
  const [movieLoading, setMovieLoading] = useState(true);
  const [showsLoading, setShowsLoading] = useState(false);
  const [movieError, setMovieError] = useState(false);
  const [showsError, setShowsError] = useState(false);
  const pageRef = useRef(null);

  useEffect(() => {
    let active = true;

    setMovie(null);
    setShows([]);
    setMovieLoading(true);
    setMovieError(false);
    setShowsError(false);

    api.get(`/movies/${id}`)
      .then((r) => {
        if (active) setMovie(r.data);
      })
      .catch((error) => {
        console.error(error);
        if (active) setMovieError(true);
      })
      .finally(() => {
        if (active) setMovieLoading(false);
      });

    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!movie) return;

    let active = true;
    setShowsLoading(true);
    setShowsError(false);

    api.get('/shows', { params: { movieId: movie.id } })
      .then((r) => {
        if (active) setShows(Array.isArray(r.data) ? r.data : []);
      })
      .catch((error) => {
        console.error(error);
        if (active) setShowsError(true);
      })
      .finally(() => {
        if (active) setShowsLoading(false);
      });

    return () => { active = false; };
  }, [movie]);

  useEffect(() => {
    if (!movie || !pageRef.current) return;

    const ctx = gsap.context(() => {
      const reduceMotion = window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      ).matches;

      if (reduceMotion) {
        gsap.set('.md-reveal', { opacity: 1, y: 0 });
        return;
      }

      gsap.fromTo(
        '.md-hero',
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out' }
      );

      gsap.to('.md-reveal', {
        opacity: 1,
        y: 0,
        duration: 0.65,
        stagger: 0.12,
        ease: 'power3.out',
        delay: 0.2,
      });
    }, pageRef);

    return () => ctx.revert();
  }, [movie, shows]);

  if (movieLoading) {
    return (
      <div className="md-body flex min-h-screen items-center justify-center bg-[#0A2A31] px-4 text-[#EFEBE0]">
        <style>{STYLES}</style>
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto h-16 w-16 animate-pulse rounded-2xl bg-[#123E47]" />
          <p className="md-display mt-5 text-xl font-bold">Preparing your screening...</p>
          <p className="mt-2 text-sm text-[#EFEBE0]/55">A little movie magic is on its way.</p>
        </div>
      </div>
    );
  }

  if (movieError || !movie) {
    return (
      <div className="md-body flex min-h-screen flex-col items-center justify-center bg-[#0A2A31] px-5 text-center text-[#EFEBE0]">
        <style>{STYLES}</style>
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#F4B63F]">404 · Film unavailable</p>
        <h1 className="md-display mt-3 text-3xl font-bold">We couldn't find this film.</h1>
        <p className="mt-3 max-w-md text-sm text-[#EFEBE0]/65">
          It may have been removed or the link may be incorrect.
        </p>
        <Link to="/" className="mt-6 rounded-xl bg-[#C2305E] px-5 py-3 text-sm font-bold text-white">
          Back to movies
        </Link>
      </div>
    );
  }

  const poster = assetUrl(movie.thumbnail_url) || FALLBACK_POSTER;

  return (
    <div ref={pageRef} className="md-body min-h-screen overflow-hidden bg-[#0A2A31] text-[#EFEBE0]">
      <style>{STYLES}</style>

      {/* Cinematic backdrop */}
      <section className="relative isolate overflow-hidden">
        <img
          src={poster}
          alt=""
          aria-hidden="true"
          className="md-backdrop pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover blur-3xl"
        />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0A2A31]/70 via-[#0A2A31]/85 to-[#0A2A31]" />

        <div className="mx-auto max-w-6xl px-4 pb-12 pt-6 sm:px-6 sm:pb-20 sm:pt-10">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-[#EFEBE0]/20 bg-[#0A2A31]/40 px-4 py-2 text-sm font-semibold text-[#EFEBE0]/80 backdrop-blur transition hover:border-[#F4B63F]/60 hover:text-[#F4B63F]"
          >
            <span aria-hidden="true">←</span> All movies
          </Link>

          <div className="md-hero mt-8 grid items-center gap-8 sm:mt-12 sm:gap-12 md:grid-cols-[minmax(220px,320px)_1fr]">
            {/* Movie poster */}
            <div className="md-poster relative mx-auto w-full max-w-[250px] sm:max-w-[300px] md:mx-0">
              <div className="absolute -inset-3 rounded-3xl border border-dashed border-[#F4B63F]/30" />
              <img
                src={poster}
                alt={`Poster for ${movie.title}`}
                className="relative aspect-[3/4] w-full rounded-2xl object-cover shadow-2xl shadow-black/50"
              />
              <div className="absolute bottom-3 left-3 flex flex-wrap gap-2">
                <span className="rounded-md bg-[#F4B63F] px-2.5 py-1 text-xs font-black text-[#0A2A31]">
                  {movie.certification || 'UA'}
                </span>
                {movie.language && (
                  <span className="rounded-md border border-white/30 bg-[#0A2A31]/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                    {movie.language}
                  </span>
                )}
              </div>
            </div>

            {/* Movie information */}
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.22em] text-[#F4B63F]">
                <span className="h-px w-8 bg-[#F4B63F]" />
                The big-screen experience
              </p>

              <h1 className="md-display mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-7xl">
                {movie.title}
              </h1>

              <div className="mt-5 flex flex-wrap gap-2">
                {movie.genre && <Meta>{movie.genre}</Meta>}
                {movie.duration_minutes && <Meta>{movie.duration_minutes} minutes</Meta>}
                {movie.language && <Meta>{movie.language}</Meta>}
              </div>

              <div className="mt-7 max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[.18em] text-[#EFEBE0]/50">
                  The story
                </p>
                <p className="mt-3 text-sm leading-7 text-[#EFEBE0]/80 sm:text-base sm:leading-8">
                  {movie.synopsis || 'The story awaits. More details coming soon.'}
                </p>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-4">
                <a
                  href="#showtimes"
                  className="md-book inline-flex items-center gap-3 rounded-xl bg-[#C2305E] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-black/20"
                >
                  Explore showtimes <span aria-hidden="true">↓</span>
                </a>
                <span className="text-xs text-[#EFEBE0]/55">
                  Find your show. Pick your seats. Enjoy the film.
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Showtimes */}
      <main id="showtimes" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
        <section className="md-reveal border-t border-[#EFEBE0]/15 pt-8 sm:pt-10">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#C2305E]">
                Find your screening
              </p>
              <h2 className="md-display mt-2 text-3xl font-bold sm:text-4xl">
                Showtimes<span className="text-[#F4B63F]">.</span>
              </h2>
              <p className="mt-2 text-sm text-[#EFEBE0]/60">
                Choose a screening and reserve your seats.
              </p>
            </div>

            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[#EFEBE0]/15 bg-[#123E47] px-4 py-2 text-xs font-semibold text-[#EFEBE0]/75">
              <span className="h-2 w-2 rounded-full bg-[#F4B63F]" />
              {showsLoading ? 'Loading screenings...' : `${shows.length} ${shows.length === 1 ? 'screening' : 'screenings'}`}
            </div>
          </div>

          {showsError ? (
            <div className="mt-8 rounded-2xl border border-[#C2305E]/40 bg-[#123E47] p-6">
              <h3 className="md-display text-xl font-bold">Showtimes couldn't load.</h3>
              <p className="mt-2 text-sm text-[#EFEBE0]/65">
                Please check your connection and try again.
              </p>
              <button
                onClick={() => {
                  setShowsError(false);
                  setShowsLoading(true);
                  api.get('/shows', { params: { movieId: movie.id } })
                    .then((r) => setShows(Array.isArray(r.data) ? r.data : []))
                    .catch((e) => {
                      console.error(e);
                      setShowsError(true);
                    })
                    .finally(() => setShowsLoading(false));
                }}
                className="mt-4 rounded-lg bg-[#C2305E] px-4 py-2 text-sm font-bold text-white"
              >
                Try again
              </button>
            </div>
          ) : showsLoading && shows.length === 0 ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-64 animate-pulse rounded-2xl bg-[#123E47]" />
              ))}
            </div>
          ) : shows.length > 0 ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shows.map((show, index) => (
                <ShowTicket key={show.id} show={show} index={index} />
              ))}
            </div>
          ) : (
            <div className="mt-8 overflow-hidden rounded-2xl border border-dashed border-[#EFEBE0]/20 bg-[#123E47]/60 px-6 py-12 text-center sm:py-16">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#0A2A31] text-[#F4B63F]">
                <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="16" rx="2" />
                  <path d="M16 3v4M8 3v4M3 11h18" />
                </svg>
              </div>
              <h3 className="md-display mt-5 text-2xl font-bold">No screenings just yet.</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#EFEBE0]/60">
                There are no scheduled shows for this film at the moment. Check back soon for upcoming screenings.
              </p>
              <Link
                to="/"
                className="mt-6 inline-flex rounded-xl border border-[#F4B63F]/40 px-5 py-3 text-sm font-semibold text-[#F4B63F] transition hover:bg-[#F4B63F] hover:text-[#0A2A31]"
              >
                Browse other movies
              </Link>
            </div>
          )}
        </section>

        {/* Brand promise strip */}
        <section className="md-reveal mt-16 grid gap-4 border-t border-[#EFEBE0]/15 pt-8 sm:grid-cols-3">
          {[
            {
              icon: '◷',
              title: 'Your time, your show',
              desc: 'Find a screening that fits your schedule.',
            },
            {
              icon: '▦',
              title: 'Choose your seats',
              desc: 'Select your preferred seats before checkout.',
            },
            {
              icon: '✦',
              title: 'Made for movie lovers',
              desc: 'Settle in and enjoy the big-screen experience.',
            },
          ].map((item) => (
            <div key={item.title} className="rounded-xl bg-[#123E47]/60 p-5">
              <span className="md-display text-3xl text-[#F4B63F]">{item.icon}</span>
              <h3 className="md-display mt-3 text-lg font-bold">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-[#EFEBE0]/60">{item.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="bg-[#071E23]">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-7 text-xs text-[#EFEBE0]/50 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="md-display text-base font-bold text-[#EFEBE0]">
            Konkani Samudai<span className="text-[#F4B63F]">.</span>
          </span>
          <Link to="/" className="transition hover:text-[#F4B63F]">
            Back to all movies ↑
          </Link>
        </div>
      </footer>
    </div>
  );
}
