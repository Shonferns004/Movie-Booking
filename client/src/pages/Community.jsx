import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import api, { assetUrl } from '../services/api.js';
import { useSileoNotice } from '../hooks/useSileoNotice.js';
import { useRealtime } from '../services/realtime.js';
import { openYoupiCheckout } from '../services/youpi.js';
import UiIcon from '../components/UiIcon.jsx';

gsap.registerPlugin(ScrollTrigger);

/**
 * Konkani Samudai - community landing page.
 *
 * Content is served by `GET /api/v1/community` (events, notices, hero images, member
 * count) and edited from the admin app. The constants below are only a fallback for
 * when the API is unreachable.
 */

const WHATSAPP = '917506419340';

const FALLBACK_EVENTS = [
  {
    id: 'fallback-food',
    title: 'Konkani Food Festival',
    kicker: '22 NOV',
    date: 'Sat, 22 Nov 2026',
    time: '11:00 AM - 9:00 PM',
    venue: 'Samudai Grounds, Margao',
    blurb: 'Forty home kitchens, one afternoon. Solkath, bangda fry, patoleo and the sorpotel contest.',
    tags: ['Food', 'Family'],
    accent: '#C8FF1F',
    tiers: [
      { id: 'general', name: 'General entry', price: 299, note: 'All stalls' },
      { id: 'patron', name: 'Patron pass', price: 999, note: 'Entry + tasting table' },
    ],
  },
];

const FALLBACK_NOTICES = [
  {
    id: 'fallback-notice',
    title: 'Membership renewals open',
    body: 'Renew before 31 December to keep your voting rights and event discounts.',
    tag: 'Membership',
    dateLabel: '12 Nov 2026',
  },
];

const MARQUEE = [
  'Monti Fest',
  'Fugdi nights',
  'Tiatr season',
  'Sunday Konkani',
  'Sorpotel contest',
  'Youth wing',
  'Film week',
  'Beach clean-up',
];

const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

/** API event -> view model used by the cards. */
function viewEvent(event) {
  const tiers = Array.isArray(event.tiers) && event.tiers.length
    ? event.tiers
    : [{ id: 'general', name: 'Entry', price: 199, note: '' }];
  return {
    id: event.id,
    title: event.title,
    kicker: event.kicker || 'EVENT',
    date: event.dateLabel || event.date || '',
    time: event.timeLabel || event.time || '',
    venue: event.venue || '',
    blurb: event.blurb || '',
    tags: Array.isArray(event.tags) ? event.tags : [],
    accent: event.accent || '#C8FF1F',
    tiers,
  };
}

export default function Community() {
  const [page, setPage] = useState(null);
  const [offline, setOffline] = useState(false);
  const [ticketEvent, setTicketEvent] = useState(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [myMembership, setMyMembership] = useState(null);
  const [shows, setShows] = useState([]);
  const root = useRef(null);

  const load = useCallback(() => {
    api
      .get('/community')
      .then((response) => {
        setPage(response.data);
        setOffline(false);
      })
      .catch(() => {
        setOffline(true);
        setPage({ hero: [], events: [], notices: [], stats: { members: 0 } });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // New movies that are airing also belong on the landing page.
  useEffect(() => {
    let stop = false;
    api
      .get('/shows', { params: { from: new Date().toISOString() } })
      .then((response) => {
        if (!stop) setShows(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        if (!stop) setShows([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  const nextMovie = useMemo(() => {
    const now = Date.now();
    const first = shows.find(
      (show) => show?.starts_at && new Date(show.starts_at).getTime() >= now,
    );
    if (!first) return null;

    const startsAt = new Date(first.starts_at);
    const when = `${startsAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${startsAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`;

    return {
      id: first.movie_id,
      title: first.movie_title,
      thumbnail: first.movie_thumbnail_url,
      meta: [
        first.movie_language,
        first.movie_certification,
        when,
        [first.theatre_name, first.auditorium_name].filter(Boolean).join(' · '),
      ]
        .filter(Boolean)
        .join(' · '),
      price: first.price_min_minor ? Math.round(Number(first.price_min_minor) / 100) : null,
    };
  }, [shows]);

  // The strip appears after the shows request resolves, so animate it separately.
  useEffect(() => {
    if (!nextMovie) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        '.js-movie-strip',
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.65, stagger: 0.08, ease: 'power3.out', delay: 0.1 },
      );
      gsap.to('.js-movie-poster', {
        y: -3,
        duration: 2.6,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        stagger: 0.2,
      });
    });

    return () => ctx.revert();
  }, [nextMovie]);

  // A member should never be asked to “become” one again.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setMyMembership(null);
      return undefined;
    }
    let stop = false;
    api
      .get('/community/membership')
      .then((response) => {
        if (!stop) setMyMembership(response.data?.member || null);
      })
      .catch(() => {
        if (!stop) setMyMembership(null);
      });
    return () => {
      stop = true;
    };
  }, []);

  // Neon Realtime: the relay forwards a "community" topic whenever events, notices,
  // hero images or members change, and the page refetches. No polling.
  useRealtime('community', load);

  const modalOpen = Boolean(ticketEvent) || joinOpen;
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setTicketEvent(null);
        setJoinOpen(false);
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [modalOpen]);

  const events = useMemo(() => {
    const list = page?.events?.length ? page.events.map(viewEvent) : offline ? FALLBACK_EVENTS : [];
    return list;
  }, [page, offline]);

  const notices = page?.notices?.length ? page.notices : offline ? FALLBACK_NOTICES : [];
  const hero = page?.hero ?? [];

  // Motion
  useEffect(() => {
    if (!root.current) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const ctx = gsap.context(() => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.js-hero-kicker', { y: 12, duration: 0.45 })
        .from('.js-hero-line', { y: 26, duration: 0.7, stagger: 0.07 }, '-=0.25')
        .from('.js-hero-copy', { y: 14, duration: 0.45 }, '-=0.35')
        .from('.js-hero-cta', { y: 10, duration: 0.35 }, '-=0.25')
        .from('.js-hero-stat', { y: 10, duration: 0.35, stagger: 0.05 }, '-=0.2')
        .from('.js-stub', { y: 30, x: 24, duration: 0.7, stagger: 0.1 }, '-=0.6')
        .from('.js-seal', { scale: 0.65, duration: 0.5, ease: 'back.out(1.7)' }, '-=0.4');

      gsap.utils.toArray('.js-reveal').forEach((element) => {
        gsap.from(element, {
          y: 26,
          opacity: 0,
          duration: 0.7,
          ease: 'power2.out',
          scrollTrigger: { trigger: element, start: 'top 88%', once: true },
        });
      });

      gsap.to('.js-marquee-track', { xPercent: -50, duration: 26, ease: 'none', repeat: -1 });
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} className="community-page relative min-h-screen overflow-hidden bg-[#1A1E23] text-[#F2F0EC]">
      <style>{PAGE_CSS}</style>
      <Grain />

      <Hero
        images={hero}
        event={events[0]}
        movie={nextMovie}
        onPick={setTicketEvent}
        stats={page?.stats}
        isMember={Boolean(myMembership)}
      />
      <Marquee />
      <FeatureRail movie={nextMovie} events={events} images={hero} onPick={setTicketEvent} />
      <Events events={events} onPick={setTicketEvent} />
      <Notices notices={notices} />
      <PhotoLibrary images={page?.gallery?.length ? page.gallery : hero} />
      <Join
        onBecomeMember={() => setJoinOpen(true)}
        membership={page?.membership}
        myMembership={myMembership}
      />
      
      {ticketEvent && <TicketModal event={ticketEvent} onClose={() => setTicketEvent(null)} />}
      {joinOpen && (
        <MembershipModal
          onClose={() => setJoinOpen(false)}
          plan={page?.membership}
          onMemberChange={setMyMembership}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ texture */

function Grain() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[1] opacity-[0.16]"
      style={{ backgroundImage: 'var(--grain)', mixBlendMode: 'soft-light' }}
    />
  );
}

/* ----------------------------------------------------------------- hero */

function Hero({ images, event, movie, onPick, stats, isMember }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (images.length < 2) return undefined;
    const timer = setInterval(() => setIndex((value) => (value + 1) % images.length), 6500);
    return () => clearInterval(timer);
  }, [images.length]);

  useEffect(() => {
    if (index >= images.length) setIndex(0);
  }, [images.length, index]);

  const memberCount = stats?.members ?? 0;

  return (
    <section className="relative flex min-h-[100svh] items-center overflow-hidden">
      {/* Background: uploaded hero images crossfading, or the gradient art. */}
      <div aria-hidden="true" className="absolute inset-0">
        {images.length === 0 && <div className="hero-glow absolute inset-0" />}
        {images.map((image, position) => (
          <div
            key={image.id}
            className="kk-hero-image absolute inset-0 bg-cover bg-center transition-opacity duration-[1400ms] ease-out"
            style={{
              backgroundImage: `url(${image.url})`,
              opacity: position === index ? 1 : 0,
              transform: position === index ? 'scale(1.03)' : 'scale(1)',
              transitionProperty: 'opacity, transform',
            }}
          />
        ))}
        {/* A denser left-to-right scrim keeps the copy readable over bright photos. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(20,24,27,0.95) 0%, rgba(20,24,27,0.80) 38%, rgba(20,24,27,0.34) 72%, rgba(20,24,27,0.14) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#1A1E23] to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-[1180px] grid-cols-1 items-center gap-8 px-5 pb-10 pt-20 sm:px-8 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 lg:pb-16 lg:pt-24">
        <div className="w-full max-w-[680px] min-w-0">
          <p className="js-hero-kicker flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#C8FF1F]">
            <span className="h-px w-9 bg-[#C8FF1F]/60" />
            Margao · since 1934
          </p>

          <h1 className="js-hero-title mt-4 font-['Fraunces',Georgia,serif] text-[34px] font-bold leading-[1.0] tracking-[-0.035em] text-[#F2F0EC] drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] sm:mt-5 sm:text-[44px] lg:text-[58px] xl:text-[66px]">
            <span className="js-hero-line block">One community.</span>
            <span className="js-hero-line block">
              A thousand <em className="not-italic text-[#C8FF1F]">stories</em>.
            </span>
          </h1>

          <p className="js-hero-copy mt-4 max-w-[480px] text-[14px] leading-[1.65] text-[#F2F0EC]/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] sm:mt-5 sm:text-[15px] sm:leading-[1.7]">
            Festivals, food, films and our people — Fugdi nights, Sunday classes and the
            Christmas market, all under one roof.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2.5 sm:mt-8 sm:gap-3">
            <a
              href="#events"
              className="js-hero-cta group inline-flex h-11 items-center justify-center gap-2 rounded-full bg-[#C8FF1F] px-5 text-[12px] font-bold tracking-wide text-[#1E2227] shadow-[0_14px_30px_-16px_rgba(200,255,31,0.9)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#D6FF5C] sm:h-12 sm:px-7 sm:text-[13px]"
            >
              Explore events
              <UiIcon name="arrow_forward" className="text-[18px] transition-transform group-hover:translate-x-0.5" />
            </a>
            <a
              href="#join"
              className="js-hero-cta group inline-flex h-11 items-center justify-center gap-2 rounded-full border border-[#F2F0EC]/25 bg-[#171B1F]/40 px-5 text-[12px] font-semibold text-[#F2F0EC]/90 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-[#C8FF1F] hover:bg-[#C8FF1F]/10 hover:text-[#C8FF1F] sm:h-12 sm:px-7 sm:text-[13px]"
            >
              <UiIcon name={isMember ? 'verified' : 'groups'} className="text-[18px]" />
              {isMember ? 'Your membership' : 'Become a member'}
            </a>
          </div>

          <dl className="js-hero-stats mt-7 flex max-w-[400px] gap-5 sm:mt-10 sm:gap-9">
            <HeroStat value={memberCount > 0 ? `${memberCount}` : '1,200+'} label="members" />
            <HeroStat value={stats?.events ? `${stats.events}` : '24'} label="events listed" />
            <HeroStat value="3" label="generations" />
          </dl>

          {images.length > 1 && (
            <div className="mt-6 flex items-center gap-2">
              {images.map((image, position) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setIndex(position)}
                  aria-label={`Hero image ${position + 1}`}
                  className={`h-1 rounded-full transition-all ${
                    position === index ? 'w-9 bg-[#C8FF1F]' : 'w-4 bg-[#F2F0EC]/25 hover:bg-[#F2F0EC]/50'
                  }`}
                />
              ))}
            </div>
          )}

          {/* Small screens: the event card becomes a slim "next up" ticket bar. */}
          {event && (
            <button
              type="button"
              onClick={() => onPick(event)}
              className="js-hero-cta mt-6 flex w-full max-w-[440px] items-center gap-3 rounded-xl border border-[#C8FF1F]/25 bg-[#171B1F]/55 px-4 py-3 text-left backdrop-blur transition-colors hover:border-[#C8FF1F]/60 md:hidden"
            >
              <span
                className="rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#1A1E23]"
                style={{ background: event.accent }}
              >
                {event.kicker}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#F2F0EC]">
                Next: {event.title}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8FF1F]">Tickets</span>
            </button>
          )}

          {movie && <MovieStrip movie={movie} className="mt-3 md:hidden" />}
        </div>

        {(event || movie) && (
          <div className="relative hidden md:block">
            {event && (
              <div className="relative mx-auto w-full max-w-[340px] -rotate-[1.5deg]">
                <Stub event={event} onPick={onPick} className="js-stub" primary />
                <div className="js-seal seal absolute -right-4 -top-5 grid h-[72px] w-[72px] place-items-center rounded-full">
                  <div className="text-center">
                    <p className="text-[7px] font-bold uppercase tracking-[0.18em] text-[#1A1E23]/70">est.</p>
                    <p className="font-['Fraunces',Georgia,serif] text-lg font-bold leading-none text-[#1A1E23]">1934</p>
                    <p className="mt-0.5 text-[6px] font-bold uppercase tracking-[0.14em] text-[#1A1E23]/70">Samudai</p>
                  </div>
                </div>
              </div>
            )}
            {movie && (
              <MovieStrip
                movie={movie}
                className={`mx-auto w-full max-w-[340px] ${event ? 'mt-10' : ''}`}
              />
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function HeroStat({ value, label }) {
  return (
    <div className="js-hero-stat flex-1 border-t border-[#F2F0EC]/20 pt-3">
      <dt className="font-['Fraunces',Georgia,serif] text-[26px] font-bold leading-none text-[#F2F0EC]">{value}</dt>
      <dd className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F2F0EC]/55">{label}</dd>
    </div>
  );
}

function MovieStrip({ movie, className = '' }) {
  return (
    <Link
      to={`/movies/${movie.id}`}
      className={`js-movie-strip kk-shine kk-shine-late group flex items-center gap-3 rounded-2xl border border-[#C8FF1F]/25 bg-[#171B1F]/75 p-3 backdrop-blur transition-colors hover:border-[#C8FF1F]/60 ${className}`}
    >
      {movie.thumbnail ? (
        <img
          src={assetUrl(movie.thumbnail)}
          alt=""
          className="js-movie-poster h-16 w-12 shrink-0 rounded-lg object-cover shadow-[0_10px_20px_-12px_rgba(0,0,0,0.9)]"
        />
      ) : (
        <div className="js-movie-poster flex h-16 w-12 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/30">
          <UiIcon name="movie" className="text-[18px]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#C8FF1F]">Now showing</p>
        <p className="mt-0.5 truncate text-[13px] font-semibold text-[#F2F0EC]">{movie.title}</p>
        <p className="mt-0.5 truncate text-[10px] text-[#F2F0EC]/50">{movie.meta}</p>
      </div>
      <div className="shrink-0 text-right">
        {movie.price ? (
          <p className="text-[11px] font-bold text-[#C8FF1F]">₹{movie.price}</p>
        ) : null}
        <p className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.12em] text-[#F2F0EC]/50">
          Book →
        </p>
      </div>
    </Link>
  );
}

function FeatureRail({ movie, events, images, onPick }) {
  const event = events?.[0];
  const poster = movie?.thumbnail ? assetUrl(movie.thumbnail) : '';
  const round = images?.[0]?.url || poster;
  if (!movie && !event) return null;

  return (
    <section className="relative w-full py-6 lg:py-10">
      <div className="kk-shell kk-shell-bleed">
        <div className="relative overflow-hidden px-5 pb-8 pt-14 sm:px-8">
          <button
            type="button"
            className="kk-play-notch kk-play-notch--inline"
            aria-label="Open the featured film"
            onClick={() => movie && window.location.assign(`/movies/${movie.id}`)}
          >
            <UiIcon name="play_arrow" className="text-[30px]" />
          </button>

          <div className="flex flex-col gap-8 pt-6 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3 sm:gap-4">
              {movie && (
                <Link
                  to={`/movies/${movie.id}`}
                  className="kk-poster-card !flex-[0_0_112px] sm:!flex-[0_0_140px]"
                >
                  {poster ? (
                    <img src={poster} alt="" loading="lazy" />
                  ) : (
                    <div className="grid h-full place-items-center text-[#B5AFA6]">
                      <UiIcon name="movie" />
                    </div>
                  )}
                  <span className="absolute inset-x-2 bottom-2 z-10 line-clamp-2 text-[9px] font-bold uppercase tracking-[0.08em] text-[#F2F0EC]">
                    {movie.title}
                  </span>
                </Link>
              )}
              {event && (
                <button
                  type="button"
                  onClick={() => onPick(event)}
                  className="kk-poster-card !flex-[0_0_112px] text-left sm:!flex-[0_0_140px]"
                >
                  <div className="flex h-full flex-col justify-between bg-[#C8FF1F] p-3 text-[#171B1F]">
                    <span className="text-[8px] font-black uppercase tracking-[0.16em]">Next event</span>
                    <span className="font-['Fraunces',Georgia,serif] text-[17px] font-black uppercase leading-[0.95]">
                      {event.title}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-[0.1em]">{event.date}</span>
                  </div>
                </button>
              )}
            </div>

            <div className="max-w-md">
              <p className="kk-rail-label">Curated for the Samudai</p>
              <h2 className="kk-display-xl mt-2 text-[#F2F0EC]">Discover your next favourite story</h2>
              <p className="mt-3 text-sm leading-relaxed text-[#F2F0EC]/65">
                Films, festivals and community nights — all in one place.
              </p>
            </div>

            {round && (
              <div className="kk-avatar-round hidden shrink-0 sm:block">
                <img src={round} alt="" />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Stub({ event, onPick, className = '', primary = false }) {
  const from = Math.min(...event.tiers.map((tier) => tier.price));
  return (
    <button
      type="button"
      onClick={() => onPick(event)}
      className={`stub kk-shine relative w-full overflow-hidden text-left transition-transform duration-300 hover:-translate-y-1 ${className} ${
        primary ? 'stub-primary' : 'stub-ghost'
      }`}
    >
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <span
          className="rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#1A1E23]"
          style={{ background: event.accent }}
        >
          {event.kicker}
        </span>
      </div>

      <div className="px-5">
        <h3 className="font-['Fraunces',Georgia,serif] text-[24px] font-bold leading-[1.04] tracking-[-0.02em]">
          {event.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-[#F2F0EC]/55">{event.blurb}</p>
      </div>

      <div className="stub-perf mx-5 my-4" />

      <div className="flex items-end justify-between px-5 pb-5">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#F2F0EC]/40">from</p>
          <p className="font-['Fraunces',Georgia,serif] text-[24px] font-bold text-[#C8FF1F]">{rupees(from)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#F2F0EC]/55">{event.date}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#F2F0EC]/75">
            Get tickets
            <UiIcon name="arrow_outward" className="text-[13px]" />
          </p>
        </div>
      </div>
    </button>
  );
}

/* --------------------------------------------------------------- marquee */

function Marquee() {
  const line = [...MARQUEE, ...MARQUEE];
  return (
    <div className="relative overflow-hidden border-y border-[#F2F0EC]/10 bg-[#171B1F] py-4">
      <div className="js-marquee-track flex w-max items-center gap-8 whitespace-nowrap">
        {line.map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-8">
            <span className="font-['Fraunces',Georgia,serif] text-[15px] italic tracking-tight text-[#F2F0EC]/55">{item}</span>
            <span className="text-[#C8FF1F]/70">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- events */

function Events({ events, onPick }) {
  return (
    <section id="events" className="scroll-mt-24 relative mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
      <SectionHead kicker="What's coming" title="Upcoming events" note="Tickets online via UPI · passes also at the counter" />

      {events.length === 0 ? (
        <div className="js-reveal mt-10 rounded-3xl border border-[#F2F0EC]/10 bg-[#242A30]/50 p-10 text-center">
          <UiIcon name="event_busy" className="text-[34px] text-[#C8FF1F]/60" />
          <p className="mt-3 text-[13px] text-[#F2F0EC]/55">
            Nothing on the calendar yet. The committee publishes events from the admin app.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {events.map((event) => (
            <EventCard key={event.id} event={event} onPick={onPick} />
          ))}
        </div>
      )}
    </section>
  );
}

function EventCard({ event, onPick }) {
  return (
    <article className="js-reveal group card-tick relative overflow-hidden rounded-[22px]">
      <div className="flex items-start justify-between px-5 pt-5">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: event.accent }}>
            {event.date}
          </p>
          <h3 className="mt-2 font-['Fraunces',Georgia,serif] text-[23px] font-bold leading-[1.05] tracking-[-0.02em]">
            {event.title}
          </h3>
        </div>
        <UiIcon name="local_activity" className="text-[22px] transition-transform duration-300 group-hover:-translate-y-0.5" style={{ color: event.accent }} />
      </div>

      <p className="mt-3 px-5 text-[12px] leading-relaxed text-[#F2F0EC]/55">{event.blurb}</p>

      <div className="mt-4 space-y-1.5 px-5">
        {event.time && (
          <p className="flex items-center gap-2 text-[11px] text-[#F2F0EC]/50">
            <UiIcon name="schedule" className="text-[14px]" />
            {event.time}
          </p>
        )}
        {event.venue && (
          <p className="flex items-center gap-2 text-[11px] text-[#F2F0EC]/50">
            <UiIcon name="location_on" className="text-[14px]" />
            {event.venue}
          </p>
        )}
      </div>

      <div className="stub-perf mx-5 my-4" />

      <div className="flex items-center justify-between px-5 pb-5">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#F2F0EC]/35">from</p>
          <p className="font-['Fraunces',Georgia,serif] text-xl font-bold text-[#C8FF1F]">
            {rupees(Math.min(...event.tiers.map((tier) => tier.price)))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPick(event)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#F2F0EC]/[0.08] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#F2F0EC] transition-colors hover:bg-[#C8FF1F] hover:text-[#1E2227]"
        >
          Get tickets
          <UiIcon name="north_east" className="text-[14px]" />
        </button>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------- notices */

function Notices({ notices }) {
  return (
    <section id="notices" className="scroll-mt-24 relative border-y border-[#F2F0EC]/10 bg-[#171B1F]/70">
      <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8">
        <SectionHead kicker="Noticeboard" title="From the committee" />

        {notices.length === 0 ? (
          <p className="mt-10 text-[13px] text-[#F2F0EC]/45">No notices right now.</p>
        ) : (
          <ul className="mt-10 divide-y divide-[#F2F0EC]/10 border-y border-[#F2F0EC]/10">
            {notices.map((notice, index) => (
              <li key={notice.id} className="js-reveal group">
                <div className="flex flex-col gap-3 py-6 sm:flex-row sm:items-baseline sm:gap-8">
                  <div className="flex items-center gap-4 sm:w-52 sm:shrink-0">
                    <span className="font-['Fraunces',Georgia,serif] text-[13px] font-bold text-[#C8FF1F]/60">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F2F0EC]/40">
                      {notice.dateLabel || ''}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-['Fraunces',Georgia,serif] text-[19px] font-bold tracking-[-0.01em]">
                        {notice.title}
                      </h3>
                      {notice.tag && (
                        <span className="rounded-full border border-[#C8FF1F]/30 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#C8FF1F]/80">
                          {notice.tag}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#F2F0EC]/55">{notice.body}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- gallery */

function PhotoLibrary({ images }) {
  const gridRef = useRef(null);
  const list = Array.isArray(images) ? images.slice(0, 8) : [];

  useEffect(() => {
    if (!gridRef.current || !list.length) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;

    const ctx = gsap.context(() => {
      gsap.utils.toArray('.js-photo').forEach((photo, index) => {
        gsap.from(photo, {
          y: 34,
          opacity: 0,
          duration: 0.7,
          delay: (index % 3) * 0.06,
          ease: 'power2.out',
          scrollTrigger: { trigger: photo, start: 'top 92%', once: true },
        });

        const inner = photo.querySelector('.js-photo-inner');
        if (inner) {
          gsap.fromTo(
            inner,
            { yPercent: 4 },
            {
              yPercent: -4,
              ease: 'none',
              scrollTrigger: {
                trigger: photo,
                start: 'top bottom',
                end: 'bottom top',
                scrub: true,
              },
            },
          );
        }
      });
    }, gridRef);

    return () => ctx.revert();
  }, [images]);

  return (
    <section id="archive" className="scroll-mt-24 mx-auto max-w-[1180px] px-5 py-10 sm:px-8 lg:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHead kicker="Photo library" title="Moments from the Samudai" />
        <Link
          to="/gallery"
          className="group inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#C8FF1F] transition-colors hover:text-[#F2F0EC]"
        >
          Open the gallery
          <UiIcon name="arrow_forward" className="text-[16px] transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="mt-10 rounded-[22px] border border-[#F2F0EC]/10 bg-[#242A30]/50 px-6 py-14 text-center">
          <UiIcon name="photo_library" className="text-[34px] text-[#C8FF1F]/60" />
          <p className="mt-3 text-[12px] text-[#F2F0EC]/55">
            Photographs from our festivals and film nights will appear here.
          </p>
          <Link
            to="/gallery"
            className="mt-5 inline-flex rounded-full bg-[#B5AFA6] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1A1E23]"
          >
            Visit the gallery
          </Link>
        </div>
      ) : (
        <div
          ref={gridRef}
          className="mt-10 grid auto-rows-[128px] grid-flow-row-dense grid-cols-2 gap-3 sm:auto-rows-[150px] sm:gap-4 md:grid-cols-4"
        >
          {list.map((image, index) => (
            <Link
              key={image.id}
              to="/gallery"
              className={`js-photo group relative overflow-hidden rounded-[18px] border border-[#F2F0EC]/10 bg-[#242A30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8FF1F] ${
                index === 0 ? 'col-span-2 row-span-2' : index === 3 ? 'md:row-span-2' : ''
              }`}
            >
              <div className="js-photo-inner absolute -inset-4">
                <img
                  src={image.url}
                  alt={image.caption || `Samudai photograph ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </div>
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#14181B]/85 via-transparent to-transparent opacity-75 transition-opacity duration-300 group-hover:opacity-95" />
              <span className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
                <span className="line-clamp-2 text-[10px] font-semibold uppercase leading-snug tracking-[0.1em] text-[#F2F0EC]/85">
                  {image.caption || 'Konkani Samudai'}
                </span>
                <UiIcon name="open_in_full" className="shrink-0 text-[16px] text-[#C8FF1F]/80 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </Link>
          ))}
        </div>
      )}

    </section>
  );
}

/* ----------------------------------------------------------------- join */

function Join({ onBecomeMember, membership, myMembership }) {
  const price = rupees(Math.round((membership?.amountMinor ?? 120000) / 100));
  const memberSince = myMembership?.createdAt
    ? new Date(myMembership.createdAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '';

  return (
    <section id="join" className="scroll-mt-24 relative border-t border-[#F2F0EC]/10 bg-[#171B1F]/70">
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-14">
        <div className="js-reveal">
          <SectionHead kicker="Join us" title="Become part of the Samudai" />
          <p className="mt-4 max-w-md text-[14px] leading-[1.75] text-[#F2F0EC]/60">
            Membership gets your family voting rights at the AGM, discounts on every event,
            priority movie seats and a place in the Sunday classes.
          </p>

          <ul className="mt-7 grid gap-3 sm:grid-cols-2">
            {[
              `${membership?.label || 'Annual membership'} · ${price} a year`,
              'Event discounts for every member',
              "Scholarships for members' children",
              'Konkani classes, choir and youth wing',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[#F2F0EC]/75">
                <UiIcon name="check_circle" className="text-[16px] text-[#B6E36A]" />
                {point}
              </li>
            ))}
          </ul>

          {myMembership && memberSince && (
            <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-[#F2F0EC]/40">
              Member since {memberSince}
            </p>
          )}
        </div>

        <div className="js-reveal relative">
          <div className="relative overflow-hidden rounded-[26px] border border-[#C8FF1F]/30 bg-gradient-to-br from-[#C8FF1F]/[0.18] via-[#242A30] to-[#1A1E23] p-6 shadow-[0_30px_70px_-45px_rgba(0,0,0,0.9)] sm:p-7">
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-14 h-44 w-44 rounded-full bg-[#C8FF1F]/15 blur-3xl"
            />
            <div className="relative">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C8FF1F]">
                    Membership
                  </p>
                  <h3 className="mt-1 font-['Fraunces',Georgia,serif] text-[22px] font-bold tracking-[-0.01em]">
                    The Samudai card
                  </h3>
                </div>
                <UiIcon name="badge" className="text-[24px] text-[#C8FF1F]/70" />
              </div>

              <div className="mt-5 flex items-end gap-2">
                <p className="font-['Fraunces',Georgia,serif] text-[42px] font-bold leading-none text-[#F2F0EC]">
                  {price}
                </p>
                <span className="pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#F2F0EC]/45">
                  / year
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#F2F0EC]/55">
                One plan · covers the whole household
              </p>

              <div className="my-5 h-px bg-[#F2F0EC]/10" />

              <ul className="space-y-2.5 text-[11px] leading-relaxed text-[#F2F0EC]/70">
                <li className="flex gap-2"><span className="text-[#C8FF1F]">✦</span> Voting rights at the AGM</li>
                <li className="flex gap-2"><span className="text-[#C8FF1F]">✦</span> Member rates on every event</li>
                <li className="flex gap-2"><span className="text-[#C8FF1F]">✦</span> Priority seating for film nights</li>
                <li className="flex gap-2"><span className="text-[#C8FF1F]">✦</span> A card for the whole family</li>
              </ul>

              <button
                type="button"
                onClick={onBecomeMember}
                className="kk-ripple mt-6 w-full rounded-full bg-[#B5AFA6] py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1A1E23] transition-colors hover:bg-[#C8FF1F]"
              >
                {myMembership ? 'View your membership' : 'Start membership'}
              </button>
              <p className="mt-2.5 text-center text-[9px] text-[#F2F0EC]/35">
                {myMembership ? 'Your membership is active' : 'Sign in first · secure UPI payment'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- bits */

function SectionHead({ kicker, title, note }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.3em] text-[#C8FF1F]">
          <span className="h-px w-8 bg-[#C8FF1F]/50" />
          {kicker}
        </p>
        <h2 className="mt-3 font-['Fraunces',Georgia,serif] text-[32px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[44px]">
          {title}
        </h2>
      </div>
      {note && <p className="max-w-[260px] text-[11px] leading-relaxed text-[#F2F0EC]/40">{note}</p>}
    </div>
  );
}

/* --------------------------------------------------------------- shared */

/* --------------------------------------------------------- ticket modal */

function TicketModal({ event, onClose }) {
  const navigate = useNavigate();
  const account = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);
  const accountName = String(account?.displayName || account?.name || '').trim();
  const accountPhone = String(account?.mobile || account?.phone || '').trim();
  const accountEmail = String(account?.email || '').trim();
  const loggedIn = Boolean(localStorage.getItem('token'));

  const [tierId, setTierId] = useState(event.tiers[0].id);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState(accountName);
  const [phone, setPhone] = useState(accountPhone);
  const [editDetails, setEditDetails] = useState(!loggedIn || !accountName || !accountPhone);
  const [order, setOrder] = useState(null);
  const [stage, setStage] = useState('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useSileoNotice(error, 'error', { title: 'Payment' });
  useSileoNotice(notice, 'info');
  const pollRef = useRef(null);

  const tier = useMemo(
    () => event.tiers.find((item) => item.id === tierId) || event.tiers[0],
    [event, tierId],
  );
  const total = tier.price * quantity;
  const waiting = stage === 'waiting';
  const offsetMinor = order ? Math.max(0, Number(order.amountMinor) - Number(order.baseAmountMinor)) : 0;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const finish = useCallback(
    async (orderId) => {
      stopPolling();
      try {
        // The gateway is the authority; the webhook can still settle this later.
        await api.post(`/community/events/checkout/${orderId}/confirm`, {});
      } catch {
        /* keep the paid state: status polling already saw SUCCESS */
      }
      setStage('paid');
      navigate(`/event-ticket/${orderId}`);
    },
    [navigate, stopPolling],
  );

  const startPolling = useCallback(
    (activeOrder) => {
      stopPolling();
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const response = await api.get(`/community/events/checkout/${activeOrder.orderId}`);
          const status = String(response.data?.status || '');
          if (status === 'paid') {
            await finish(activeOrder.orderId);
            return;
          }
          if (status === 'failed' || status === 'expired') {
            stopPolling();
            setStage('form');
            setError('The payment did not go through. Please try again.');
          }
        } catch {
          // Transient errors are expected while the UPI app is open.
        }
        if (attempts >= 60) stopPolling();
      }, 3500);
    },
    [finish, stopPolling],
  );

  function paymentOptions(activeOrder, overrides = {}) {
    return {
      name: name.trim() || accountName,
      phone: phone.trim() || accountPhone,
      email: accountEmail,
      description: `${event.title} · ${activeOrder.tierName} × ${activeOrder.quantity}`,
      onSuccess: () => finish(activeOrder.orderId),
      onFailed: (result) => {
        stopPolling();
        setStage('form');
        setError(result?.error || result?.reason || 'Payment failed. Please try again.');
      },
      onCancelled: () => {
        setNotice('Payment window closed. You can reopen it with the button below.');
      },
      ...overrides,
    };
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const response = await api.post(`/community/events/${event.id}/checkout`, {
        tierId: tier.id,
        quantity,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      const created = response.data;
      setOrder(created);
      startPolling(created);
      const mode = await openYoupiCheckout(created, paymentOptions(created));
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      stopPolling();
      setStage('form');
      setError(e?.response?.data?.error || e?.message || 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!order || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const mode = await openYoupiCheckout(order, paymentOptions(order));
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      setError(e?.message || 'Could not reopen the payment window.');
    } finally {
      setBusy(false);
    }
  }

  function resetOrder() {
    setOrder(null);
    setStage('form');
    setError('');
    setNotice('');
    stopPolling();
  }

  const whatsappLink = useMemo(() => {
    const lines = [
      `Event: ${event.title}`,
      `Pass: ${order?.tierName || tier.name}`,
      `Quantity: ${order?.quantity || quantity}`,
      `Paid: ₹${order?.amount || total}`,
      order?.orderId ? `Order: ${order.orderId}` : null,
      name.trim() ? `Name: ${name.trim()}` : null,
    ].filter(Boolean);
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [event, tier, quantity, total, name, order]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#14181B]/85 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${event.title} tickets`}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div className="modal-in max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[26px] border border-[#F2F0EC]/12 bg-[#242A30] p-6 shadow-2xl sm:rounded-[26px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: event.accent }}>
              {event.date}
            </p>
            <h3 className="mt-1.5 font-['Fraunces',Georgia,serif] text-[26px] font-bold leading-[1.02] tracking-[-0.02em]">
              {event.title}
            </h3>
            <p className="mt-1.5 text-[11px] text-[#F2F0EC]/50">{event.venue}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#F2F0EC]/15 p-2 text-[#F2F0EC]/60 transition-colors hover:text-[#F2F0EC]"
            aria-label="Close"
          >
            <UiIcon name="close" className="text-[18px]" />
          </button>
        </div>

        {stage === 'paid' ? (
          <div className="mt-8 text-center">
            <UiIcon name="check_circle" className="text-[46px] text-[#B6E36A]" />
            <h4 className="mt-3 font-['Fraunces',Georgia,serif] text-[24px] font-bold">You're in.</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-[#F2F0EC]/65">
              {order?.quantity || quantity} × {order?.tierName || tier.name} · {event.title}
            </p>
            <p className="mt-1 font-['Fraunces',Georgia,serif] text-[22px] font-bold text-[#C8FF1F]">
              ₹{order?.amount || total}
            </p>
            {order?.orderId && (
              <p className="mt-2 font-mono text-[10px] text-[#F2F0EC]/40">Order {order.orderId}</p>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-[#F2F0EC]/40">
              Show this order at the counter. Send the committee a copy on WhatsApp and they will
              keep your passes ready.
            </p>
            {order?.orderId && (
              <Link
                to={`/event-ticket/${order.orderId}`}
                onClick={onClose}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C8FF1F] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#1A1E23]"
              >
                <UiIcon name="confirmation_number" className="text-[15px]" />
                View your ticket
              </Link>
            )}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#B6E36A] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#1A1E23]"
            >
              <UiIcon name="chat" className="text-[15px]" />
              Send details
            </a>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 block w-full rounded-full border border-[#F2F0EC]/18 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F2F0EC]/70"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-2">
              {event.tiers.map((option) => {
                const selected = option.id === tierId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (option.id !== tierId) {
                        setTierId(option.id);
                        resetOrder();
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-[#C8FF1F]/70 bg-[#C8FF1F]/[0.09]'
                        : 'border-[#F2F0EC]/10 bg-[#1A1E23]/40 hover:border-[#F2F0EC]/25'
                    }`}
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#F2F0EC]">{option.name}</span>
                      {option.note && <span className="block text-[10px] text-[#F2F0EC]/45">{option.note}</span>}
                    </span>
                    <span className="font-['Fraunces',Georgia,serif] text-lg font-bold text-[#C8FF1F]">
                      {rupees(option.price)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-[#F2F0EC]/10 bg-[#1A1E23]/40 px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#F2F0EC]/50">Passes</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuantity((value) => Math.max(1, value - 1));
                    resetOrder();
                  }}
                  className="h-7 w-7 rounded-full border border-[#F2F0EC]/20 text-base leading-none text-[#F2F0EC]/80 hover:border-[#C8FF1F]"
                  aria-label="Fewer passes"
                >
                  −
                </button>
                <span className="w-5 text-center text-[13px] font-bold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuantity((value) => Math.min(10, value + 1));
                    resetOrder();
                  }}
                  className="h-7 w-7 rounded-full border border-[#F2F0EC]/20 text-base leading-none text-[#F2F0EC]/80 hover:border-[#C8FF1F]"
                  aria-label="More passes"
                >
                  +
                </button>
              </div>
            </div>

            {loggedIn && !editDetails ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#F2F0EC]/10 bg-[#1A1E23]/40 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#F2F0EC]/40">Paying as</p>
                  <p className="truncate text-[12px] font-semibold text-[#F2F0EC]">
                    {name}
                    {phone ? ` · ${phone}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDetails(true)}
                  className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8FF1F]"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <input
                  value={name}
                  onChange={(changeEvent) => setName(changeEvent.target.value)}
                  placeholder="Name (for the pass)"
                  className="w-full rounded-xl border border-[#F2F0EC]/12 bg-[#1A1E23]/60 px-3 py-2.5 text-[11px] text-[#F2F0EC] outline-none placeholder:text-[#F2F0EC]/25 focus:border-[#C8FF1F]"
                />
                <input
                  value={phone}
                  onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                  inputMode="tel"
                  placeholder="Mobile number (for the pass)"
                  className="w-full rounded-xl border border-[#F2F0EC]/12 bg-[#1A1E23]/60 px-3 py-2.5 text-[11px] text-[#F2F0EC] outline-none placeholder:text-[#F2F0EC]/25 focus:border-[#C8FF1F]"
                />
              </div>
            )}

            <div className="mt-4 rounded-[18px] border border-[#F2F0EC]/10 bg-[#171B1F] p-4">
              <div className="flex items-center justify-between text-[11px] text-[#F2F0EC]/60">
                <span>Passes</span>
                <span>{quantity} × {rupees(tier.price)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#F2F0EC]/60">
                <span>Ticket total</span>
                <span>{rupees(total)}</span>
              </div>
              {offsetMinor > 0 && (
                <div className="mt-1 flex items-center justify-between text-[10px] text-[#F2F0EC]/40">
                  <span>Payment verification</span>
                  <span>+ ₹{(offsetMinor / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-[#F2F0EC]/10 pt-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#F2F0EC]/45">
                  Payable
                </span>
                <span className="font-['Fraunces',Georgia,serif] text-[24px] font-bold text-[#C8FF1F]">
                  ₹{order ? order.amount : total}
                </span>
              </div>
              {order && offsetMinor > 0 && (
                <p className="mt-2 text-[9px] leading-relaxed text-[#F2F0EC]/35">
                  A small verification amount identifies your transfer. It is part of the total
                  and goes to the Samudai.
                </p>
              )}
            </div>

            {notice && <p className="mt-3 text-center text-[11px] text-[#C8FF1F]/85">{notice}</p>}
            {error && <p className="mt-3 text-center text-[11px] text-[#F08A80]">{error}</p>}

            {order ? (
              <button
                type="button"
                onClick={reopen}
                disabled={busy || waiting}
                className="mt-4 w-full rounded-full border border-[#C8FF1F]/45 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C8FF1F] transition-colors hover:bg-[#C8FF1F] hover:text-[#1A1E23] disabled:opacity-60"
              >
                {busy ? 'Opening…' : waiting ? 'Waiting for payment…' : 'Reopen secure payment'}
              </button>
            ) : (
              <button
                type="button"
                onClick={pay}
                disabled={busy}
                className="mt-4 w-full rounded-full bg-[#C8FF1F] py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1E2227] disabled:opacity-60"
              >
                {busy ? 'Opening secure payment…' : `Pay ${rupees(total)} with YouPI`}
              </button>
            )}

            <p className="mt-2 text-center text-[9px] text-[#F2F0EC]/35">
              Secure UPI checkout · YouPI · passes also at the counter
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------- membership modal */

function MembershipModal({ onClose, plan: initialPlan, onMemberChange }) {
  const token = localStorage.getItem('token');
  const account = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const [plan, setPlan] = useState(initialPlan || { label: 'Annual membership', amountMinor: 120000 });
  const [name, setName] = useState(String(account?.displayName || account?.name || ''));
  const [phone, setPhone] = useState(String(account?.mobile || account?.phone || ''));
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const email = String(account?.email || '');
  const [member, setMember] = useState(null);
  const [stage, setStage] = useState('form');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useSileoNotice(error, 'error', { title: 'Payment' });
  useSileoNotice(notice, 'info');
  const pollRef = useRef(null);

  const waiting = stage === 'waiting';
  const total = Math.round((plan?.amountMinor ?? 120000) / 100);

  const applyMember = useCallback(
    (next) => {
      setMember(next);
      onMemberChange?.(next);
    },
    [onMemberChange],
  );

  useEffect(() => {
    if (!token) return;
    api
      .get('/community/membership')
      .then((response) => {
        if (response.data?.plan) setPlan(response.data.plan);
        if (response.data?.member) applyMember(response.data.member);
      })
      .catch(() => {});
  }, [token]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const finish = useCallback(
    async (orderId) => {
      stopPolling();
      try {
        const response = await api.post(`/community/membership/checkout/${orderId}/confirm`, {});
        if (response.data?.member) applyMember(response.data.member);
      } catch {
        // The gateway status is authoritative; the webhook can still settle this.
      }
      setStage('paid');
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (orderId) => {
      stopPolling();
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const response = await api.get(`/community/membership/checkout/${orderId}`);
          const status = String(response.data?.status || '');
          if (status === 'paid') {
            if (response.data?.member) applyMember(response.data.member);
            stopPolling();
            setStage('paid');
            return;
          }
          if (status === 'failed' || status === 'expired') {
            stopPolling();
            setStage('form');
            setError('The payment did not go through. Please try again.');
          }
        } catch {
          // Keep polling while the UPI app is open.
        }
        if (attempts >= 60) stopPolling();
      }, 3500);
    },
    [stopPolling],
  );

  function handleDob(value) {
    setDob(value);
    if (!value) return;
    const birth = new Date(value);
    if (Number.isNaN(birth.getTime())) return;
    const years = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (years >= 0 && years < 120) setAge(String(years));
  }

  async function pay() {
    if (busy) return;
    if (!name.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (!/^[0-9+\s-]{8,16}$/.test(phone.trim())) {
      setError('Enter a valid contact number.');
      return;
    }
    if (!gender) {
      setError('Select your gender.');
      return;
    }
    if (!dob) {
      setError('Enter your date of birth.');
      return;
    }
    if (!maritalStatus) {
      setError('Select your marital status.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const response = await api.post('/community/membership/checkout', {
        name: name.trim(),
        phone: phone.trim(),
        gender,
        age: age ? Number(age) : undefined,
        dob,
        maritalStatus,
      });
      const created = response.data;
      setOrder(created);
      startPolling(created.orderId);

      const mode = await openYoupiCheckout(created, {
        name: name.trim(),
        phone: phone.trim(),
        email,
        description: `Konkani Samudai membership · ${name.trim()}`,
        onSuccess: () => finish(created.orderId),
        onFailed: (result) => {
          stopPolling();
          setStage('form');
          setError(result?.error || result?.reason || 'Payment failed. Please try again.');
        },
        onCancelled: () => setNotice('Payment window closed. You can reopen it below.'),
      });
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      stopPolling();
      setStage('form');
      setError(e?.response?.data?.error || e?.message || 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!order || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const mode = await openYoupiCheckout(order, {
        name: name.trim(),
        phone: phone.trim(),
        email,
        description: `Konkani Samudai membership · ${name.trim()}`,
        onSuccess: () => finish(order.orderId),
        onFailed: (result) => {
          stopPolling();
          setStage('form');
          setError(result?.error || result?.reason || 'Payment failed. Please try again.');
        },
        onCancelled: () => setNotice('Payment window closed. You can reopen it below.'),
      });
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      setError(e?.message || 'Could not reopen the payment window.');
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'w-full rounded-xl border border-[#F2F0EC]/12 bg-[#1A1E23]/70 px-3.5 py-2.5 text-[12px] text-[#F2F0EC] outline-none transition-colors placeholder:text-[#F2F0EC]/25 focus:border-[#F2F0EC]/20 focus:outline-none focus:ring-0 focus-visible:outline-none';
  const labelClass = 'mb-1.5 block text-[8px] font-bold uppercase tracking-[0.18em] text-[#F2F0EC]/45';

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#14181B]/85 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Become a member"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div className="modal-in max-h-[93vh] w-full max-w-[700px] overflow-y-auto rounded-t-[26px] border border-[#F2F0EC]/12 bg-[#242A30] shadow-2xl sm:rounded-[26px]">
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C8FF1F]">Membership</p>
              <h3 className="mt-1.5 font-['Fraunces',Georgia,serif] text-[26px] font-bold leading-[1.02] tracking-[-0.02em]">
                Join Konkani Samudai
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#F2F0EC]/15 p-2 text-[#F2F0EC]/60 transition-colors hover:text-[#F2F0EC]"
              aria-label="Close"
            >
              <UiIcon name="close" className="text-[18px]" />
            </button>
          </div>

          {!token ? (
            <div className="mt-8 text-center">
              <UiIcon name="lock" className="text-[38px] text-[#C8FF1F]/70" />
              <p className="mt-3 text-[13px] leading-relaxed text-[#F2F0EC]/65">
                You need an account before you can become a member. It takes a minute.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#C8FF1F] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[#1E2227]"
              >
                Sign in to continue
                <UiIcon name="arrow_forward" className="text-[16px]" />
              </Link>
              <p className="mt-3 text-[10px] text-[#F2F0EC]/35">
                New here? The sign-in page also creates an account.
              </p>
            </div>
          ) : stage === 'paid' || member ? (
            <div className="mt-8 text-center">
              <UiIcon name="verified" className="text-[44px] text-[#B6E36A]" />
              <h4 className="mt-3 font-['Fraunces',Georgia,serif] text-[24px] font-bold">You're a member</h4>
              <p className="mt-2 text-[12px] leading-relaxed text-[#F2F0EC]/65">
                {member?.name || name} · {rupees(Math.round(Number(member?.amountMinor || plan.amountMinor) / 100))} a year
              </p>
              <p className="mt-1 text-[11px] text-[#F2F0EC]/45">
                Status <span className="font-semibold capitalize text-[#C8FF1F]">{member?.status || 'active'}</span>
              </p>
              <p className="mt-3 text-[10px] leading-relaxed text-[#F2F0EC]/40">
                Your membership is active. Show your account at the counter for member rates on events
                and priority seats.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full rounded-full bg-[#B5AFA6] py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1A1E23]"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-[#C8FF1F]/30 bg-gradient-to-r from-[#C8FF1F]/[0.14] to-[#C8FF1F]/[0.07] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#C8FF1F]">
                      {plan?.label || 'Annual membership'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#F2F0EC]/50">One plan · renews yearly</p>
                  </div>
                  <p className="font-['Fraunces',Georgia,serif] text-[30px] font-bold leading-none text-[#C8FF1F]">
                    {rupees(total)}
                    <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#F2F0EC]/40">/ yr</span>
                  </p>
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#F2F0EC]/55">
                  <li>✦ Member rates</li>
                  <li>✦ Priority seats</li>
                  <li>✦ AGM voting</li>
                  <li>✦ Household card</li>
                </ul>
              </div>

              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#F2F0EC]/40">
                Your details
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className={labelClass}>Full name</span>
                  <input
                    value={name}
                    onChange={(changeEvent) => setName(changeEvent.target.value)}
                    placeholder="Your name"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <span className={labelClass}>Contact number</span>
                  <input
                    value={phone}
                    onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                    inputMode="tel"
                    placeholder="10-digit mobile number"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <span className={labelClass}>Gender</span>
                  <select
                    value={gender}
                    onChange={(changeEvent) => setGender(changeEvent.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Select</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <span className={labelClass}>Marital status</span>
                  <select
                    value={maritalStatus}
                    onChange={(changeEvent) => setMaritalStatus(changeEvent.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Select</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <span className={labelClass}>Date of birth</span>
                  <input
                    type="date"
                    value={dob}
                    onChange={(changeEvent) => handleDob(changeEvent.target.value)}
                    className={`${fieldClass} [color-scheme:dark]`}
                  />
                </div>

                <div>
                  <span className={labelClass}>Age</span>
                  <input
                    value={age}
                    onChange={(changeEvent) => setAge(changeEvent.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    placeholder="Auto"
                    className={fieldClass}
                  />
                </div>
              </div>

              {notice && <p className="mt-3 text-center text-[11px] text-[#C8FF1F]/85">{notice}</p>}
              {error && <p className="mt-3 text-center text-[11px] text-[#F08A80]">{error}</p>}

              {order ? (
                <button
                  type="button"
                  onClick={reopen}
                  disabled={busy || waiting}
                  className="mt-5 w-full rounded-full border border-[#C8FF1F]/45 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C8FF1F] transition-colors hover:bg-[#C8FF1F] hover:text-[#1A1E23] disabled:opacity-60"
                >
                  {busy ? 'Opening…' : waiting ? 'Waiting for payment…' : 'Reopen secure payment'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pay}
                  disabled={busy}
                  className="mt-5 w-full rounded-full bg-[#C8FF1F] py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1E2227] shadow-[0_18px_40px_-20px_rgba(200,255,31,0.9)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {busy ? 'Opening secure payment…' : `Pay ${rupees(total)}`}
                </button>
              )}

              <p className="mt-2.5 text-center text-[9px] text-[#F2F0EC]/35">
                Secure UPI checkout · your membership activates automatically
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ css */

const PAGE_CSS = `
.community-page {
  --grain: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");
}
.community-page .hero-glow {
  background:
    radial-gradient(760px 420px at 22% -8%, rgba(200,255,31,0.20), transparent 62%),
    radial-gradient(620px 380px at 88% 4%, rgba(200,255,31,0.24), transparent 66%);
}
.community-page .stub {
  border-radius: 20px;
  box-shadow: 0 30px 70px -34px rgba(0,0,0,0.9);
}
.community-page .stub-primary {
  background: linear-gradient(160deg, rgba(38,44,51,0.96) 0%, rgba(36,42,48,0.98) 62%);
  border: 1px solid rgba(200,255,31,0.35);
  backdrop-filter: blur(6px);
}
.community-page .stub-ghost {
  background: linear-gradient(160deg, rgba(38,44,51,0.96) 0%, rgba(23,27,31,0.98) 70%);
  border: 1px solid rgba(242,240,236,0.12);
}
.community-page .stub-perf {
  position: relative;
  height: 1px;
  background-image: linear-gradient(90deg, rgba(242,240,236,0.28) 45%, transparent 0);
  background-size: 9px 1px;
  background-repeat: repeat-x;
}
.community-page .stub-perf::before,
.community-page .stub-perf::after {
  content: '';
  position: absolute;
  top: 50%;
  height: 13px;
  width: 13px;
  border-radius: 999px;
  background: #1A1E23;
  transform: translateY(-50%);
}
.community-page .stub-perf::before { left: -22px; }
.community-page .stub-perf::after { right: -22px; }
.community-page .seal {
  background: radial-gradient(circle at 35% 30%, #E7FF9E, #C8FF1F 62%, #A8D819);
  box-shadow: 0 18px 40px -18px rgba(200,255,31,0.7), inset 0 0 0 1px rgba(23,27,31,0.18);
}
.community-page .seal::after {
  content: '';
  position: absolute;
  inset: 7px;
  border-radius: 999px;
  border: 1px dashed rgba(23,27,31,0.35);
}
.community-page .card-tick {
  background: linear-gradient(165deg, rgba(38,44,51,0.75), rgba(23,27,31,0.9));
  border: 1px solid rgba(242,240,236,0.10);
  transition: transform .35s ease, border-color .35s ease, box-shadow .35s ease;
}
.community-page .card-tick:hover {
  transform: translateY(-4px);
  border-color: rgba(200,255,31,0.32);
  box-shadow: 0 30px 60px -40px rgba(0,0,0,0.9);
}
.community-page .plate {
  background: linear-gradient(160deg, rgba(38,44,51,0.55), rgba(23,27,31,0.75));
  border: 1px solid rgba(242,240,236,0.09);
}
.community-page .modal-in { animation: modalIn .32s cubic-bezier(.22,1,.36,1); }
@keyframes modalIn {
  from { opacity: 0; transform: translateY(18px) scale(.985); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .community-page .modal-in { animation: none; }
}
`;

