import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api, { assetUrl } from '../services/api.js';
import { useRealtime } from '../services/realtime.js';
import { HeroHeader, Lightbox } from '../components/SiteChrome.jsx';
import { MembershipModal, TicketModal } from './CommunityModals.jsx';

const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;

const FALLBACK_EVENTS = [
  {
    id: 'fallback-food',
    title: 'Konkani Food Festival',
    kicker: '22 NOV',
    date: 'Sat, 22 Nov 2026',
    time: '11:00 AM - 9:00 PM',
    venue: 'Samudai Grounds, Margao',
    blurb:
      'Forty home kitchens, one afternoon. Solkath, bangda fry, patoleo and the sorpotel contest.',
    tags: ['Food', 'Family'],
    tiers: [
      { id: 'general', name: 'General entry', price: 299, note: 'All stalls' },
      { id: 'patron', name: 'Patron pass', price: 999, note: 'Entry and tasting table' },
    ],
  },
];

const FALLBACK_NOTICES = [
  {
    id: 'fallback-notice',
    title: 'Membership renewals are open',
    body: 'Renew before 31 December to keep your voting rights and event discounts.',
    tag: 'Membership',
    dateLabel: '12 Nov 2026',
  },
];

function viewEvent(event) {
  const tiers =
    Array.isArray(event.tiers) && event.tiers.length
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
    tiers,
  };
}

function formatFromAuditorium(name = '') {
  if (/dolby/i.test(name)) return 'Dolby Atmos';
  if (/laser/i.test(name)) return '2K Laser';
  return name || '2K Laser';
}

function clockLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date
    .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
    .toLowerCase();
}

function dateLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export default function Community() {
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [offline, setOffline] = useState(false);
  const [movies, setMovies] = useState([]);
  const [shows, setShows] = useState([]);
  const [ticketEvent, setTicketEvent] = useState(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [myMembership, setMyMembership] = useState(null);
  const [heroIndex, setHeroIndex] = useState(0);
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(() => {
    api
      .get('/community')
      .then((response) => {
        setPage(response.data);
        setOffline(false);
      })
      .catch(() => {
        setOffline(true);
        setPage({ hero: [], gallery: [], events: [], notices: [], stats: {} });
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let stop = false;
    api
      .get('/movies')
      .then((response) => {
        if (!stop) setMovies(Array.isArray(response.data) ? response.data : []);
      })
      .catch(() => {
        if (!stop) setMovies([]);
      });
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    let stop = false;
    api
      .get('/shows')
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
    const list = page?.events?.length
      ? page.events.map(viewEvent)
      : offline
        ? FALLBACK_EVENTS
        : [];
    return list;
  }, [page, offline]);

  const notices = page?.notices?.length ? page.notices : offline ? FALLBACK_NOTICES : [];
  const gallery = page?.gallery?.length ? page.gallery : page?.hero || [];
  const heroImages = page?.hero?.length ? page.hero : gallery;

  const slides = useMemo(() => {
    const first = heroImages[0]?.url || gallery[0]?.url || '';
    const second = gallery[0]?.url || first;
    const third = gallery[1]?.url || second;
    return [
      {
        kicker: 'Est. 1934 · Margao, Goa · Film · Music · Food',
        title: 'Cinema, festivals and the Konkani community.',
        subtitle:
          'The house that has gathered here for four generations. Films every week, and a stage for everything else.',
        image: first,
      },
      {
        kicker: 'Four Generations · Margao Verandah',
        title: 'A neighbourhood house built for every generation.',
        subtitle:
          'Sunday Konkani classes, the youth choir, scholarship drives, and afternoon tea beneath laterite arches.',
        image: second,
      },
      {
        kicker: 'Samudai Cineplex · Screen 1 · 2K Laser',
        title: 'Calibrated cinema every evening in Margao.',
        subtitle:
          'Weekly Konkani and Hindi premieres with reserved stalls and balcony seating. Book online via YouPI.',
        image: third,
      },
    ];
  }, [heroImages, gallery]);

  const slide = slides[heroIndex] || slides[0];
  const films = useMemo(
    () => movies.filter((movie) => movie.thumbnail_url || movie.synopsis).slice(0, 3),
    [movies],
  );

  const showsByMovie = useMemo(() => {
    const map = new Map();
    const now = Date.now();
    shows
      .filter((show) => show?.starts_at && new Date(show.starts_at).getTime() >= now)
      .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
      .forEach((show) => {
        const list = map.get(show.movie_id) || [];
        list.push({
          id: show.id,
          movieId: show.movie_id,
          time: clockLabel(show.starts_at),
          dateLabel: dateLabel(show.starts_at),
          startsAt: show.starts_at,
          format: formatFromAuditorium(show.auditorium_name),
          auditoriumName: [show.theatre_name, show.auditorium_name].filter(Boolean).join(' · '),
          price: show.price_min_minor ? Math.round(Number(show.price_min_minor) / 100) : 600,
        });
        map.set(show.movie_id, list);
      });
    return map;
  }, [shows]);

  const featured = useMemo(() => {
    for (const movie of films) {
      const first = showsByMovie.get(movie.id)?.[0];
      if (first) return { movie, show: first };
    }
    return null;
  }, [films, showsByMovie]);

  const featuredEvent = events[0];
  const fromPrice = featuredEvent ? Math.min(...featuredEvent.tiers.map((tier) => tier.price)) : 0;
  const membershipPrice = rupees(Math.round((page?.membership?.amountMinor ?? 100) / 100));
  const lowerImages = [gallery[2], gallery[3]].filter(Boolean);
  const circleImage = gallery[4]?.url || gallery[0]?.url || '';
  const galleryShots = gallery.slice(0, 8);
  const eventImages = events.map((_, index) => gallery[(index + 2) % Math.max(gallery.length, 1)]?.url || '');

  function openGallery(index) {
    if (!galleryShots.length) return;
    setLightbox(index);
  }

  function openShow(movie) {
    const show = showsByMovie.get(movie.id)?.[0];
    if (show) navigate(`/shows/${show.id}/seats`);
    else navigate('/movies');
  }

  function noticeAction(notice) {
    const tag = String(notice.tag || '').toLowerCase();
    if (tag.includes('member')) {
      setJoinOpen(true);
      return;
    }
    navigate('/movies');
  }

  if (!page) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-16 space-y-16" role="status" aria-label="Loading the house">
        <span className="sr-only">Loading the house</span>
        <section className="space-y-5 animate-pulse">
          <div className="relative pb-5">
            <div className="relative rounded-[28px] bg-[#16191D] min-h-[340px] sm:min-h-[380px] lg:min-h-[395px] flex flex-col justify-between overflow-hidden">
              <HeroHeader active="house" />
              <div className="relative z-10 space-y-3 px-5 sm:px-8 pb-9 pt-8">
                <div className="h-3 w-32 rounded bg-[#2A3037]" />
                <div className="h-10 w-96 max-w-full rounded bg-[#2A3037]" />
                <div className="h-3 w-[30rem] max-w-full rounded bg-[#252A30]" />
                <div className="h-3 w-80 max-w-full rounded bg-[#252A30]" />
                <div className="flex flex-wrap gap-3 pt-1">
                  <div className="h-10 w-40 rounded-xl bg-[#2A3037]" />
                  <div className="h-10 w-40 rounded-xl bg-[#252A30]" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-5 grid grid-cols-2 gap-4">
              {[0, 1].map((item) => (
                <div key={item} className="relative flex aspect-[3/3.35] flex-col justify-between rounded-[22px] bg-[#252A30] p-3">
                  <div className="h-6 w-16 rounded-full bg-[#2A3037]" />
                  <div className="h-8 w-full rounded-lg bg-[#2A3037]" />
                </div>
              ))}
            </div>
            <div className="lg:col-span-7 flex flex-col justify-between rounded-[22px] bg-[#252A30] p-5">
              <div className="space-y-3">
                <div className="h-3 w-24 rounded bg-[#2A3037]" />
                <div className="h-8 w-2/3 rounded bg-[#2A3037]" />
                <div className="h-3 w-full rounded bg-[#1E2227]" />
                <div className="h-3 w-5/6 rounded bg-[#1E2227]" />
              </div>
              <div className="mt-6 flex gap-3">
                <div className="h-9 w-36 rounded-xl bg-[#2A3037]" />
                <div className="h-9 w-28 rounded-xl bg-[#1E2227]" />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-6 border-t border-[#B5AFA6]/15 pt-8 animate-pulse">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="h-3 w-24 rounded bg-[#252A30]" />
              <div className="h-7 w-64 rounded bg-[#2A3037]" />
            </div>
            <div className="h-9 w-32 rounded-full bg-[#252A30]" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {[0, 1].map((item) => (
              <div key={item} className="flex flex-col gap-4 rounded-[22px] bg-[#252A30] p-4 sm:flex-row">
                <div className="h-40 w-full shrink-0 rounded-xl bg-[#2A3037] sm:w-40" />
                <div className="flex-1 space-y-3 py-1">
                  <div className="h-3 w-20 rounded bg-[#1E2227]" />
                  <div className="h-6 w-3/4 rounded bg-[#2A3037]" />
                  <div className="h-3 w-full rounded bg-[#1E2227]" />
                  <div className="h-3 w-4/5 rounded bg-[#1E2227]" />
                  <div className="h-9 w-32 rounded-lg bg-[#2A3037]" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-6 border-t border-[#B5AFA6]/15 pt-8 animate-pulse">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-[#252A30]" />
            <div className="h-7 w-56 rounded bg-[#2A3037]" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {[0, 1, 2, 3, 4].map((item) => (
              <div key={item} className="relative flex aspect-[3/3.45] flex-col justify-between rounded-[22px] bg-[#252A30] p-3">
                <div className="h-6 w-16 rounded-full bg-[#2A3037]" />
                <div className="space-y-2">
                  <div className="h-6 w-24 rounded-full bg-[#2A3037]" />
                  <div className="h-9 w-full rounded-xl bg-[#B5AFA6]/30" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-3 pb-16 space-y-16">
      <section id="house-hero" className="space-y-5">
        <div className="relative pb-5">
          <div className="relative rounded-[28px] bg-[#16191D] text-[#F2F0EB] overflow-hidden min-h-[340px] sm:min-h-[380px] lg:min-h-[395px] flex flex-col justify-between">
            {slide.image && (
              <img
                src={slide.image}
                alt=""
                className="absolute inset-0 w-full h-full object-cover object-center transition-opacity duration-500"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-[#16191D]/95 via-[#1E2227]/72 to-[#1E2227]/35" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#16191D]/92 via-transparent to-[#16191D]/65" />

            <HeroHeader active="house" />

            <div className="relative z-10 flex items-end justify-between gap-6 px-5 sm:px-8 pb-8 sm:pb-9 pt-8">
              <div className="max-w-xl space-y-3">
                <p className="text-xs font-semibold tracking-wide text-[#C8FF1F]">{slide.kicker}</p>
                <h1 className="font-editorial text-3xl sm:text-[42px] font-semibold tracking-tight text-[#F2F0EB] leading-[1.08]">
                  {slide.title}
                </h1>
                <p className="text-sm text-[#B5AFA6] leading-relaxed max-w-lg">{slide.subtitle}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => document.getElementById('whats-on')?.scrollIntoView({ behavior: 'smooth' })}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#C8FF1F] text-[#1E2227] hover:bg-[#B5AFA6] transition-colors"
                  >
                    See what&rsquo;s on
                  </button>
                  <button
                    type="button"
                    onClick={() => setJoinOpen(true)}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-[#1E2227]/75 backdrop-blur-md text-[#F2F0EB] border border-[#B5AFA6]/30 hover:border-[#C8FF1F] hover:text-[#C8FF1F] transition-colors"
                  >
                    {myMembership ? 'Samudai card active' : 'Start membership'}
                  </button>
                </div>
              </div>

              <div className="hidden sm:flex flex-col items-center gap-2.5 pb-3 shrink-0">
                {slides.map((item, index) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => setHeroIndex(index)}
                    aria-label={item.title}
                    className={`w-3.5 rounded-full transition-all duration-200 ${
                      index === heroIndex
                        ? 'h-9 bg-[#C8FF1F]'
                        : 'h-6 bg-[#1E2227]/60 border border-[#B5AFA6]/45 hover:border-[#C8FF1F]'
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          <svg
            viewBox="0 0 160 46"
            className="pointer-events-none absolute bottom-[18px] left-1/2 -translate-x-1/2 w-[156px] h-[46px] z-20"
            aria-hidden="true"
          >
            <path d="M 0 46 C 28 46, 38 4, 80 4 C 122 4, 132 46, 160 46 Z" fill="#1E2227" />
          </svg>
          <button
            type="button"
            onClick={() => document.getElementById('whats-on')?.scrollIntoView({ behavior: 'smooth' })}
            aria-label="Scroll down"
            className="absolute bottom-0 left-1/2 -translate-x-1/2 z-30 w-14 h-14 rounded-full bg-[#252A30] hover:bg-[#C8FF1F] text-[#F2F0EB] hover:text-[#1E2227] shadow-md flex items-center justify-center transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M12 5v14M19 12l-7 7-7-7" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-5 grid grid-cols-2 gap-4">
            {[
              {
                image: lowerImages[0]?.url,
                badge: 'EST. 1934',
                tag: 'Four generations',
                title: 'Heritage & Verandah',
                index: 2,
              },
              {
                image: lowerImages[1]?.url,
                badge: 'SUNDAYS',
                tag: 'Youth wing & choir',
                title: 'Konkani Classes',
                index: 3,
              },
            ].map((card, index) => (
              <button
                key={card.title}
                type="button"
                onClick={() => (index === 0 ? openGallery(card.index) : document.getElementById('join-house')?.scrollIntoView({ behavior: 'smooth' }))}
                className="group relative rounded-[22px] overflow-hidden bg-[#252A30] aspect-[3/3.35] flex flex-col justify-between p-3 text-left shadow-sm"
              >
                {card.image && (
                  <img
                    src={card.image}
                    alt={card.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-[#16191D]/95 via-[#1E2227]/30 to-[#16191D]/45" />
                <div className="relative z-10">
                  <span className="px-2.5 py-1 rounded-full bg-[#B5AFA6] text-[#1E2227] font-mono text-[11px] font-bold">
                    {card.badge}
                  </span>
                </div>
                <div className="relative z-10 space-y-2">
                  <span className="inline-block px-2.5 py-1 rounded-full bg-[#1E2227]/85 border border-[#B5AFA6]/20 text-[#B5AFA6] text-[11px] font-medium">
                    {card.tag}
                  </span>
                  <div className="w-full rounded-xl bg-[#B5AFA6] group-hover:bg-[#C8FF1F] text-[#1E2227] px-3 py-2 flex items-center justify-between gap-2 transition-colors">
                    <span className="text-xs font-semibold truncate">{card.title}</span>
                    <span>→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="lg:col-span-7 flex flex-col justify-between gap-4 py-1 lg:pl-4">
            <div className="space-y-3 max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">Next at the Samudai</p>
              <h2 className="font-editorial text-2xl sm:text-[28px] font-semibold text-[#F2F0EB] leading-snug">
                What&rsquo;s on at the Samudai — Tickets online via UPI, or at the box office.
              </h2>
              <p className="text-sm text-[#B5AFA6] leading-relaxed">
                Members pay the member rate across every film screening, food festival, and folk
                evening. From forty home kitchens on 22 November to Konkani Nights in Screen 1.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-0.5">
                {featuredEvent && (
                  <button
                    type="button"
                    onClick={() => setTicketEvent(featuredEvent)}
                    className="text-sm font-semibold text-[#C8FF1F] underline underline-offset-4 hover:text-[#B5AFA6]"
                  >
                    Get tickets: {featuredEvent.title}
                  </button>
                )}
                <span className="text-[#B5AFA6]/50">·</span>
                <Link to="/movies" className="text-sm font-semibold text-[#F2F0EB] underline underline-offset-4 hover:text-[#C8FF1F]">
                  All films and showtimes
                </Link>
              </div>
            </div>

            <div className="flex items-end justify-between gap-6">
              <div className="grid grid-cols-3 gap-5 border-t border-[#B5AFA6]/15 pt-3 text-[#F2F0EB]">
                <div>
                  <p className="text-[11px] text-[#B5AFA6]">Established</p>
                  <p className="font-mono text-base font-semibold text-[#C8FF1F] tabular-nums">1934</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#B5AFA6]">Home</p>
                  <p className="text-sm font-semibold mt-0.5">Margao, Goa</p>
                </div>
                <div>
                  <p className="text-[11px] text-[#B5AFA6]">Programme</p>
                  <p className="text-sm font-semibold mt-0.5">Film · Music · Food</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => openGallery(0)}
                className="group relative w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-[#252A30] border-4 border-[#B5AFA6]/40 hover:border-[#C8FF1F] shadow-md shrink-0 transition-colors"
              >
                {circleImage && (
                  <img
                    src={circleImage}
                    alt="Open gallery"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-[#16191D]/45 group-hover:bg-[#16191D]/30 transition-colors flex flex-col items-center justify-center p-2 text-center">
                  <span className="font-mono text-[10px] font-semibold text-[#C8FF1F]">Est. 1934</span>
                  <span className="text-xs font-semibold text-[#F2F0EB]">Open gallery</span>
                </div>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="whats-on" className="pt-8 border-t border-[#B5AFA6]/15 space-y-8">
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">Festivals &amp; Evenings</p>
          <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#F2F0EB]">What&rsquo;s on at the Samudai</h2>
          <p className="text-sm text-[#B5AFA6]">Tickets online via UPI, or at the box office. Members pay the member rate.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-7">
          {events.map((event, index) => {
            const from = Math.min(...event.tiers.map((tier) => tier.price));
            const [day, month] = (event.kicker || '').split(/\s+/);
            const image = eventImages[index];
            return (
              <article
                key={event.id}
                className="bg-[#252A30] text-[#F2F0EB] rounded-[24px] overflow-hidden grid grid-cols-1 sm:grid-cols-12 shadow-sm"
              >
                <div className="sm:col-span-5 relative min-h-[240px] bg-[#16191D]">
                  {image && <img src={image} alt={event.title} className="w-full h-full object-cover sm:absolute sm:inset-0" />}
                </div>
                <div className="sm:col-span-7 p-6 sm:p-7 flex flex-col justify-between space-y-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-[#C8FF1F] font-semibold">
                        {day} {month}
                      </span>
                      <span className="text-xs text-[#B5AFA6]">
                        {event.date}
                        {event.tags?.length ? ` · ${event.tags.join(' · ')}` : ''}
                      </span>
                    </div>
                    <h3 className="font-editorial text-2xl font-semibold text-[#F2F0EB]">{event.title}</h3>
                    <p className="text-sm text-[#B5AFA6] leading-relaxed">{event.blurb}</p>
                  </div>
                  <div className="space-y-4 pt-3 border-t border-[#B5AFA6]/15">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <p className="text-[#B5AFA6]/80">Doors</p>
                        <p className="text-[#F2F0EB] font-medium mt-0.5">{event.time}</p>
                      </div>
                      <div>
                        <p className="text-[#B5AFA6]/80">Where</p>
                        <p className="text-[#F2F0EB] font-medium mt-0.5">{event.venue}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 pt-1">
                      <span className="font-mono text-lg font-semibold text-[#C8FF1F] tabular-nums">
                        from {rupees(from)}
                      </span>
                      <button
                        type="button"
                        onClick={() => setTicketEvent(event)}
                        className="px-5 py-2.5 rounded-xl text-xs font-semibold bg-[#C8FF1F] text-[#1E2227] hover:bg-[#B5AFA6] transition-colors"
                      >
                        Get tickets
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="now-showing" className="pt-8 border-t border-[#B5AFA6]/15 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">Now Showing</p>
            <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#F2F0EB]">All films and showtimes</h2>
          </div>
          <Link
            to="/movies"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#C8FF1F] underline underline-offset-4 hover:text-[#B5AFA6]"
          >
            <span>Open full Movies schedule</span>
            <span>→</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {films.map((movie) => {
            const movieShows = (showsByMovie.get(movie.id) || []).slice(0, 3);
            const first = movieShows[0];
            return (
              <article
                key={movie.id}
                className="group bg-[#252A30] text-[#F2F0EB] rounded-[22px] overflow-hidden shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-[16/11] bg-[#16191D] overflow-hidden">
                    {movie.thumbnail_url ? (
                      <img
                        src={assetUrl(movie.thumbnail_url)}
                        alt={movie.title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-[#2A3037] to-[#16191D]" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#252A30] via-[#16191D]/20 to-[#16191D]/55" />
                    <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-[#1E2227]/85 border border-[#B5AFA6]/25 text-[#F2F0EB] font-mono text-[11px] font-semibold tabular-nums">
                        {movie.certification || 'UA'} · {movie.duration_minutes ? `${movie.duration_minutes} min` : '—'}
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-[#1E2227]/85 border border-[#C8FF1F]/30 text-[#C8FF1F] font-mono text-[11px] font-semibold">
                        {first?.format || '2K Laser'}
                      </span>
                    </div>
                  </div>
                  <div className="px-5 pt-4 pb-3 space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#B5AFA6]">
                      {[movie.language, movie.genre].filter(Boolean).join(' · ')}
                    </p>
                    <h3 className="font-editorial text-2xl font-semibold text-[#F2F0EB] group-hover:text-[#C8FF1F] transition-colors">
                      {movie.title}
                    </h3>
                    <p className="text-xs text-[#B5AFA6] leading-relaxed line-clamp-2">{movie.synopsis}</p>
                  </div>
                </div>
                <div className="px-5 pb-5 pt-2 space-y-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {movieShows.length ? (
                      movieShows.map((show) => (
                        <Link
                          key={show.id}
                          to={`/shows/${show.id}/seats`}
                          className="px-2.5 py-1 rounded-lg bg-[#1E2227] border border-[#B5AFA6]/20 hover:border-[#C8FF1F] hover:text-[#C8FF1F] font-mono text-[11px] font-medium text-[#F2F0EB] tabular-nums transition-colors"
                        >
                          {show.time}
                        </Link>
                      ))
                    ) : (
                      <span className="text-[11px] text-[#B5AFA6]">Showtimes at the box office</span>
                    )}
                  </div>
                  <div className="pt-3 border-t border-[#B5AFA6]/15 flex items-center justify-between gap-3">
                    <div>
                      <span className="font-mono text-base font-semibold text-[#C8FF1F] tabular-nums">
                        from {rupees(first?.price || 600)}
                      </span>
                      <p className="text-[11px] text-[#B5AFA6] mt-0.5">{first?.auditoriumName || 'Samudai Cineplex, Margao'}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openShow(movie)}
                      className="px-4 py-2 rounded-xl bg-[#C8FF1F] group-hover:bg-[#B5AFA6] text-[#1E2227] text-xs font-semibold transition-colors whitespace-nowrap"
                    >
                      Choose seats
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {featured && (
          <div className="p-6 sm:p-7 rounded-[22px] bg-[#B5AFA6] text-[#1E2227] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="font-editorial text-2xl font-semibold text-[#1E2227]">{featured.movie.title}</h3>
              <p className="text-sm text-[#2C3138]">
                {featured.show.dateLabel} · {featured.show.time} · {featured.show.auditoriumName}
              </p>
            </div>
            <div className="flex items-center gap-5 shrink-0">
              <span className="font-mono text-lg font-semibold text-[#1E2227] tabular-nums">
                from {rupees(featured.show.price)}
              </span>
              <Link
                to={`/shows/${featured.show.id}/seats`}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#1E2227] text-[#C8FF1F] hover:bg-[#C8FF1F] hover:text-[#1E2227] transition-colors"
              >
                Choose seats
              </Link>
            </div>
          </div>
        )}
      </section>

      <section id="committee" className="pt-10 border-t border-[#B5AFA6]/15 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-12">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">House Announcements</p>
            <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#F2F0EB]">From the committee</h2>
            <p className="text-sm text-[#B5AFA6] leading-relaxed">
              Seasonal circulars, AGM notices, and household updates from the Margao managing committee.
            </p>
          </div>
          <div className="border-l-2 border-[#C8FF1F] pl-4 space-y-1">
            <p className="text-xs text-[#B5AFA6]">Committee Desk · Margao</p>
            <p className="font-mono text-xs font-semibold text-[#F2F0EB] tabular-nums">10:00 – 18:00 · Daily</p>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4 pb-2">
          {notices.map((notice, index) => (
            <article
              key={notice.id}
              style={{ top: 48 + index * 12, zIndex: index + 1 }}
              className="sticky group rounded-[20px] bg-[#252A30] hover:bg-[#2A3037] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-[0_-10px_24px_rgba(16,19,23,0.68)] transition-colors duration-200"
            >
              <div className="flex items-start gap-4 sm:gap-5">
                <span className="font-mono text-xl sm:text-2xl font-semibold text-[#C8FF1F] tabular-nums leading-none pt-0.5 shrink-0">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#B5AFA6]">
                    <span className="font-mono tabular-nums">{notice.dateLabel}</span>
                    <span className="text-[#B5AFA6]/40">·</span>
                    <span className="font-semibold uppercase tracking-wider text-[11px] text-[#B5AFA6]">{notice.tag}</span>
                  </div>
                  <h3 className="font-editorial text-lg sm:text-xl font-semibold text-[#F2F0EB] group-hover:text-[#C8FF1F] transition-colors">
                    {notice.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[#B5AFA6] leading-snug max-w-xl">{notice.body}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => noticeAction(notice)}
                className="self-start sm:self-center shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#1E2227] border border-[#B5AFA6]/25 text-xs font-semibold text-[#F2F0EB] group-hover:bg-[#C8FF1F] group-hover:text-[#1E2227] group-hover:border-[#C8FF1F] transition-colors whitespace-nowrap"
              >
                <span>{String(notice.tag || '').toLowerCase().includes('member') ? 'Renew card' : 'See programme'}</span>
                <span>→</span>
              </button>
            </article>
          ))}
        </div>
      </section>

      <section id="gallery" className="pt-8 border-t border-[#B5AFA6]/15 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">The full archive</p>
            <h2 className="font-editorial text-3xl font-semibold text-[#F2F0EB]">Moments from the Samudai</h2>
          </div>
          <button
            type="button"
            onClick={() => openGallery(0)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#B5AFA6] text-[#1E2227] hover:bg-[#C8FF1F] transition-colors self-start sm:self-auto"
          >
            Open the gallery
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {galleryShots.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => openGallery(index)}
              className="group relative aspect-[4/3] rounded-2xl overflow-hidden bg-[#252A30] text-left"
            >
              <img
                src={image.url}
                alt={image.caption || `Konkani Samudai photograph ${index + 1}`}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      </section>

      <section id="join-house" className="pt-8 border-t border-[#B5AFA6]/15 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <div className="lg:col-span-6 space-y-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">Join the house</p>
          <h2 className="font-editorial text-3xl sm:text-4xl font-semibold text-[#F2F0EB]">
            A card that stays with the family.
          </h2>
          <p className="text-sm text-[#B5AFA6] leading-relaxed">
            Since 1934, membership has covered a whole household at a nominal annual contribution —
            voting rights, member ticket rates, priority cinema booking, and Sunday Konkani classes.
          </p>
          <ul className="space-y-2.5 text-sm text-[#F2F0EB]">
            <li className="flex items-center gap-2.5"><span className="text-[#C8FF1F]">✓</span> Voting rights at the annual general meeting</li>
            <li className="flex items-center gap-2.5"><span className="text-[#C8FF1F]">✓</span> Member rates on every event and screening</li>
            <li className="flex items-center gap-2.5"><span className="text-[#C8FF1F]">✓</span> Priority booking for film nights · Scholarships · Youth wing</li>
          </ul>
        </div>

        <div className="lg:col-span-6 rounded-[24px] bg-[#B5AFA6] text-[#1E2227] p-7 sm:p-8 flex flex-col justify-between gap-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-xs font-semibold text-[#2C3138]">KS · 1934 · MARGAO</p>
              <h3 className="font-editorial text-3xl font-semibold mt-1">The Samudai card</h3>
              <p className="text-xs text-[#2C3138] mt-1">
                {page?.membership?.label || 'Annual membership'} · one household
              </p>
            </div>
            <span className="font-mono text-3xl font-bold text-[#1E2227] tabular-nums">{membershipPrice}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#1E2227]/15">
            <span className="text-xs font-medium text-[#2C3138]">
              {myMembership
                ? `Active card${myMembership.cardNumber ? `: ${myMembership.cardNumber}` : ''}`
                : 'Sign in first. Secure UPI payment through YouPI.'}
            </span>
            <button
              type="button"
              onClick={() => setJoinOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-[#1E2227] text-[#C8FF1F] hover:bg-[#C8FF1F] hover:text-[#1E2227] text-xs font-semibold transition-colors"
            >
              {myMembership ? 'View Samudai Card' : 'Start membership'}
            </button>
          </div>
        </div>
      </section>

      {ticketEvent && <TicketModal event={ticketEvent} onClose={() => setTicketEvent(null)} />}
      {joinOpen && (
        <MembershipModal
          onClose={() => setJoinOpen(false)}
          plan={page?.membership}
          onMemberChange={setMyMembership}
        />
      )}
      {lightbox != null && (
        <Lightbox
          images={galleryShots}
          index={lightbox}
          onChange={setLightbox}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  );
}
