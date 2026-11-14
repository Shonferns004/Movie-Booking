import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { QRCodeSVG } from 'qrcode.react';
import api from '../services/api.js';
import { useRealtime } from '../services/realtime.js';
import { openYoupiCheckout } from '../services/youpi.js';

gsap.registerPlugin(ScrollTrigger);

/**
 * Konkani Samudai - community landing page.
 *
 * Content is served by `GET /api/v1/community` (events, notices, hero images, member
 * count) and edited from the admin app. The constants below are only a fallback for
 * when the API is unreachable.
 */

const UPI_ID = '7506419340-1@naviaxis';
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
    accent: '#F5B841',
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
    accent: event.accent || '#F5B841',
    tiers,
  };
}

export default function Community() {
  const [page, setPage] = useState(null);
  const [offline, setOffline] = useState(false);
  const [ticketEvent, setTicketEvent] = useState(null);
  const [joinOpen, setJoinOpen] = useState(false);
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
        .from('.js-hero-cta', { y: 12, duration: 0.35, stagger: 0.06 }, '-=0.25')
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
    <div ref={root} className="community-page relative min-h-screen overflow-hidden bg-[#082328] text-[#F6F1E7]">
      <style>{PAGE_CSS}</style>
      <Grain />

      <Hero images={hero} event={events[0]} onPick={setTicketEvent} stats={page?.stats} />
      <Marquee />
      <Events events={events} onPick={setTicketEvent} />
      <Notices notices={notices} />
      <Archive />
      <Join onBecomeMember={() => setJoinOpen(true)} />
      <Footer />

      {ticketEvent && <TicketModal event={ticketEvent} onClose={() => setTicketEvent(null)} />}
      {joinOpen && <MembershipModal onClose={() => setJoinOpen(false)} />}
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

function Hero({ images, event, onPick, stats }) {
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
    <section className="relative flex min-h-[calc(100svh-72px)] items-center overflow-hidden">
      {/* Background: uploaded hero images crossfading, or the gradient art. */}
      <div aria-hidden="true" className="absolute inset-0">
        {images.length === 0 && <div className="hero-glow absolute inset-0" />}
        {images.map((image, position) => (
          <div
            key={image.id}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-[1400ms] ease-out"
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
              'linear-gradient(90deg, rgba(4,22,26,0.95) 0%, rgba(4,22,26,0.80) 38%, rgba(4,22,26,0.34) 72%, rgba(4,22,26,0.14) 100%)',
          }}
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#082328] to-transparent" />
      </div>

      <div className="relative mx-auto grid max-w-[1180px] items-center gap-8 px-5 py-12 sm:px-8 md:grid-cols-[minmax(0,1fr)_320px] md:gap-12 md:py-16 lg:grid-cols-[minmax(0,1fr)_340px] lg:py-20">
        <div className="max-w-[680px]">
          <p className="js-hero-kicker flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-[0.3em] text-[#F5B841]">
            <span className="h-px w-9 bg-[#F5B841]/60" />
            Margao · since 1934
          </p>

          <h1 className="js-hero-title mt-5 font-['Fraunces',Georgia,serif] text-[40px] font-bold leading-[0.98] tracking-[-0.035em] text-[#F6F1E7] drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] sm:text-[52px] lg:text-[62px] xl:text-[68px]">
            <span className="js-hero-line block">One community.</span>
            <span className="js-hero-line block">
              A thousand <em className="not-italic text-[#F5B841]">stories</em>.
            </span>
          </h1>

          <p className="js-hero-copy mt-5 max-w-[480px] text-[15px] leading-[1.7] text-[#F6F1E7]/80 drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
            Festivals, food, films and our people — Fugdi nights, Sunday classes and the
            Christmas market, all under one roof.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#events"
              className="js-hero-cta group inline-flex min-h-12 items-center gap-2 rounded-full bg-[#C2305E] px-7 text-[13px] font-bold tracking-wide text-white shadow-[0_14px_30px_-16px_rgba(194,48,94,0.9)] transition-transform hover:-translate-y-0.5"
            >
              Explore events
              <span className="material-symbols-outlined text-[18px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
            </a>
            <a
              href="#join"
              className="js-hero-cta inline-flex min-h-12 items-center gap-2 rounded-full border border-[#F6F1E7]/25 bg-[#061D22]/40 px-7 text-[13px] font-semibold text-[#F6F1E7]/90 backdrop-blur transition-colors hover:border-[#F5B841] hover:text-[#F5B841]"
            >
              <span className="material-symbols-outlined text-[18px]">groups</span>
              Become a member
            </a>
          </div>

          <dl className="js-hero-stats mt-10 flex max-w-[400px] gap-9">
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
                    position === index ? 'w-9 bg-[#F5B841]' : 'w-4 bg-[#F6F1E7]/25 hover:bg-[#F6F1E7]/50'
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
              className="js-hero-cta mt-6 flex w-full max-w-[440px] items-center gap-3 rounded-xl border border-[#F5B841]/25 bg-[#061D22]/55 px-4 py-3 text-left backdrop-blur transition-colors hover:border-[#F5B841]/60 md:hidden"
            >
              <span
                className="rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.16em] text-[#082328]"
                style={{ background: event.accent }}
              >
                {event.kicker}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#F6F1E7]">
                Next: {event.title}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#F5B841]">Tickets</span>
            </button>
          )}
        </div>

        {event && (
          <div className="relative hidden md:block">
            <div className="relative mx-auto w-full max-w-[340px] -rotate-[1.5deg]">
              <Stub event={event} onPick={onPick} className="js-stub" primary />
              <div className="js-seal seal absolute -right-4 -top-5 grid h-[72px] w-[72px] place-items-center rounded-full">
                <div className="text-center">
                  <p className="text-[7px] font-bold uppercase tracking-[0.18em] text-[#082328]/70">est.</p>
                  <p className="font-['Fraunces',Georgia,serif] text-lg font-bold leading-none text-[#082328]">1934</p>
                  <p className="mt-0.5 text-[6px] font-bold uppercase tracking-[0.14em] text-[#082328]/70">Samudai</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function HeroStat({ value, label }) {
  return (
    <div className="js-hero-stat flex-1 border-t border-[#F6F1E7]/20 pt-3">
      <dt className="font-['Fraunces',Georgia,serif] text-[26px] font-bold leading-none text-[#F6F1E7]">{value}</dt>
      <dd className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#F6F1E7]/55">{label}</dd>
    </div>
  );
}

function Stub({ event, onPick, className = '', primary = false }) {
  const from = Math.min(...event.tiers.map((tier) => tier.price));
  return (
    <button
      type="button"
      onClick={() => onPick(event)}
      className={`stub relative w-full overflow-hidden text-left transition-transform duration-300 hover:-translate-y-1 ${className} ${
        primary ? 'stub-primary' : 'stub-ghost'
      }`}
    >
      <div className="flex items-center justify-between px-5 pb-3 pt-4">
        <span
          className="rounded-md px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#082328]"
          style={{ background: event.accent }}
        >
          {event.kicker}
        </span>
      </div>

      <div className="px-5">
        <h3 className="font-['Fraunces',Georgia,serif] text-[24px] font-bold leading-[1.04] tracking-[-0.02em]">
          {event.title}
        </h3>
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-relaxed text-[#F6F1E7]/55">{event.blurb}</p>
      </div>

      <div className="stub-perf mx-5 my-4" />

      <div className="flex items-end justify-between px-5 pb-5">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#F6F1E7]/40">from</p>
          <p className="font-['Fraunces',Georgia,serif] text-[24px] font-bold text-[#F5B841]">{rupees(from)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#F6F1E7]/55">{event.date}</p>
          <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#F6F1E7]/75">
            Get tickets
            <span className="material-symbols-outlined text-[13px]">arrow_outward</span>
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
    <div className="relative overflow-hidden border-y border-[#F6F1E7]/10 bg-[#061D22] py-4">
      <div className="js-marquee-track flex w-max items-center gap-8 whitespace-nowrap">
        {line.map((item, index) => (
          <span key={`${item}-${index}`} className="flex items-center gap-8">
            <span className="font-['Fraunces',Georgia,serif] text-[15px] italic tracking-tight text-[#F6F1E7]/55">{item}</span>
            <span className="text-[#F5B841]/70">✦</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- events */

function Events({ events, onPick }) {
  return (
    <section id="events" className="relative mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
      <SectionHead kicker="What's coming" title="Upcoming events" note="Tickets online via UPI · passes also at the counter" />

      {events.length === 0 ? (
        <div className="js-reveal mt-10 rounded-3xl border border-[#F6F1E7]/10 bg-[#0C3238]/50 p-10 text-center">
          <span className="material-symbols-outlined text-[34px] text-[#F5B841]/60">event_busy</span>
          <p className="mt-3 text-[13px] text-[#F6F1E7]/55">
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
        <span className="material-symbols-outlined text-[22px] transition-transform duration-300 group-hover:-translate-y-0.5" style={{ color: event.accent }}>
          local_activity
        </span>
      </div>

      <p className="mt-3 px-5 text-[12px] leading-relaxed text-[#F6F1E7]/55">{event.blurb}</p>

      <div className="mt-4 space-y-1.5 px-5">
        {event.time && (
          <p className="flex items-center gap-2 text-[11px] text-[#F6F1E7]/50">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            {event.time}
          </p>
        )}
        {event.venue && (
          <p className="flex items-center gap-2 text-[11px] text-[#F6F1E7]/50">
            <span className="material-symbols-outlined text-[14px]">location_on</span>
            {event.venue}
          </p>
        )}
      </div>

      <div className="stub-perf mx-5 my-4" />

      <div className="flex items-center justify-between px-5 pb-5">
        <div>
          <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-[#F6F1E7]/35">from</p>
          <p className="font-['Fraunces',Georgia,serif] text-xl font-bold text-[#F5B841]">
            {rupees(Math.min(...event.tiers.map((tier) => tier.price)))}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onPick(event)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#F6F1E7]/[0.08] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.1em] text-[#F6F1E7] transition-colors hover:bg-[#C2305E] hover:text-white"
        >
          Get tickets
          <span className="material-symbols-outlined text-[14px]">north_east</span>
        </button>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------- notices */

function Notices({ notices }) {
  return (
    <section id="notices" className="relative border-y border-[#F6F1E7]/10 bg-[#061D22]/70">
      <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8">
        <SectionHead kicker="Noticeboard" title="From the committee" />

        {notices.length === 0 ? (
          <p className="mt-10 text-[13px] text-[#F6F1E7]/45">No notices right now.</p>
        ) : (
          <ul className="mt-10 divide-y divide-[#F6F1E7]/10 border-y border-[#F6F1E7]/10">
            {notices.map((notice, index) => (
              <li key={notice.id} className="js-reveal group">
                <div className="flex flex-col gap-3 py-6 sm:flex-row sm:items-baseline sm:gap-8">
                  <div className="flex items-center gap-4 sm:w-52 sm:shrink-0">
                    <span className="font-['Fraunces',Georgia,serif] text-[13px] font-bold text-[#F5B841]/60">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F6F1E7]/40">
                      {notice.dateLabel || ''}
                    </span>
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-['Fraunces',Georgia,serif] text-[19px] font-bold tracking-[-0.01em]">
                        {notice.title}
                      </h3>
                      {notice.tag && (
                        <span className="rounded-full border border-[#F5B841]/30 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-[#F5B841]/80">
                          {notice.tag}
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#F6F1E7]/55">{notice.body}</p>
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

/* -------------------------------------------------------------- archive */

function Archive() {
  const items = [
    { year: '2026', title: 'Monti Fest', detail: '420 families, 1,100 plates of shevyo.' },
    { year: '2026', title: 'Konkani Film Week', detail: '12 films, 6 directors, 3 sold-out evenings.' },
    { year: '2025', title: 'Utorda Beach Clean-up', detail: '120 volunteers, 800 kg of waste.' },
    { year: '2025', title: 'First Cookbook Launch', detail: '68 family recipes collected and printed.' },
  ];

  return (
    <section id="archive" className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
      <SectionHead kicker="Our story" title="What we've already done" />

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <article key={item.title} className="js-reveal plate group relative overflow-hidden rounded-[18px] p-5">
            <span className="absolute -right-3 -top-8 font-['Fraunces',Georgia,serif] text-[86px] font-bold leading-none text-[#F6F1E7]/[0.045]">
              {item.year}
            </span>
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#F5B841]/80">{item.year}</p>
            <h3 className="mt-2 font-['Fraunces',Georgia,serif] text-[18px] font-bold leading-tight">{item.title}</h3>
            <p className="mt-2 text-[11px] leading-relaxed text-[#F6F1E7]/50">{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="js-reveal mt-8 flex flex-col gap-5 overflow-hidden rounded-[22px] border border-[#F5B841]/25 bg-gradient-to-r from-[#F5B841]/[0.09] to-transparent p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div>
          <h3 className="font-['Fraunces',Georgia,serif] text-[22px] font-bold tracking-[-0.02em]">Also running: our screenhouse</h3>
          <p className="mt-1 text-[12px] text-[#F6F1E7]/60">Konkani and world cinema, four screens, tickets from ₹150.</p>
        </div>
        <Link
          to="/movies"
          className="inline-flex items-center gap-2 self-start rounded-full bg-[#F6F1E7] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#082328] transition-transform hover:-translate-y-0.5"
        >
          See what's showing
          <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- join */

function Join({ onBecomeMember }) {
  return (
    <section id="join" className="relative border-t border-[#F6F1E7]/10 bg-[#061D22]/70">
      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[1fr_420px] lg:gap-14 lg:py-20">
        <div>
          <SectionHead kicker="Join us" title="Become part of the Samudai" />
          <p className="mt-4 max-w-md text-[14px] leading-[1.75] text-[#F6F1E7]/60">
            Membership gets your family voting rights at the AGM, discounts on every event,
            priority movie seats and a place in the Sunday classes.
          </p>

          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              'Family membership · ₹1,200 a year',
              'Event discounts for every member',
              "Scholarships for members' children",
              'Konkani classes, choir and youth wing',
            ].map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[12px] leading-relaxed text-[#F6F1E7]/75">
                <span className="material-symbols-outlined text-[16px] text-[#7FCBA8]">check_circle</span>
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onBecomeMember}
              className="inline-flex items-center gap-2 rounded-full bg-[#C2305E] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white transition-transform hover:-translate-y-0.5"
            >
              <span className="material-symbols-outlined text-[15px]">badge</span>
              Become a member
            </button>
            <a
              href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hi! I would like to know more about Konkani Samudai.')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#7FCBA8] px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-[#082328] transition-transform hover:-translate-y-0.5"
            >
              <span className="material-symbols-outlined text-[15px]">chat</span>
              Message on WhatsApp
            </a>
          </div>
        </div>

        <div className="js-reveal rounded-[24px] border border-[#F6F1E7]/12 bg-[#0C3238] p-6 sm:p-7">
          <h3 className="font-['Fraunces',Georgia,serif] text-[22px] font-bold tracking-[-0.02em]">What membership gets you</h3>
          <ul className="mt-4 space-y-3 text-[12px] leading-relaxed text-[#F6F1E7]/65">
            <li className="flex gap-2.5"><span className="text-[#F5B841]">✦</span> Voting rights at the AGM</li>
            <li className="flex gap-2.5"><span className="text-[#F5B841]">✦</span> Member rates on every event</li>
            <li className="flex gap-2.5"><span className="text-[#F5B841]">✦</span> Priority seating for film nights</li>
            <li className="flex gap-2.5"><span className="text-[#F5B841]">✦</span> A card for the whole family</li>
          </ul>
          <button
            type="button"
            onClick={onBecomeMember}
            className="mt-6 w-full rounded-full border border-[#F5B841]/40 py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#F5B841] transition-colors hover:bg-[#F5B841] hover:text-[#082328]"
          >
            Start membership
          </button>
          <p className="mt-3 text-center text-[9px] text-[#F6F1E7]/35">Sign in first · pay by UPI</p>
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
        <p className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.3em] text-[#F5B841]">
          <span className="h-px w-8 bg-[#F5B841]/50" />
          {kicker}
        </p>
        <h2 className="mt-3 font-['Fraunces',Georgia,serif] text-[32px] font-bold leading-[1.02] tracking-[-0.03em] sm:text-[44px]">
          {title}
        </h2>
      </div>
      {note && <p className="max-w-[260px] text-[11px] leading-relaxed text-[#F6F1E7]/40">{note}</p>}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#F6F1E7]/10 bg-[#061D22]">
      <div className="mx-auto max-w-[1180px] px-5 py-12 sm:px-8">
        <p className="font-['Fraunces',Georgia,serif] text-[34px] font-bold leading-none tracking-[-0.03em] text-[#F6F1E7]/90 sm:text-[52px]">
          Konkani <span className="italic text-[#F5B841]">Samudai</span>
        </p>
        <div className="mt-8 flex flex-col gap-6 border-t border-[#F6F1E7]/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-[#F6F1E7]/40">Cinema, screenhouse and community · Margao, Goa</p>
          <ul className="flex flex-wrap gap-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#F6F1E7]/45">
            <li><a className="transition-colors hover:text-[#F5B841]" href="#events">Events</a></li>
            <li><a className="transition-colors hover:text-[#F5B841]" href="#notices">Notices</a></li>
            <li><Link className="transition-colors hover:text-[#F5B841]" to="/movies">Movies</Link></li>
            <li><Link className="transition-colors hover:text-[#F5B841]" to="/my-tickets">My tickets</Link></li>
          </ul>
        </div>
      </div>
    </footer>
  );
}

/* --------------------------------------------------------------- shared */

function UpiBlock({ amount, note }) {
  const [copied, setCopied] = useState(false);

  const link = useMemo(
    () =>
      `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('Konkani Samudai')}` +
      `&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`,
    [amount, note],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="mt-4 rounded-[18px] border border-[#F6F1E7]/10 bg-[#061D22] p-5 text-center">
      <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-[#F6F1E7]/40">Pay by UPI</p>
      <div className="mx-auto mt-3 w-fit rounded-xl bg-white p-3">
        <QRCodeSVG value={link} size={140} level="M" marginSize={0} />
      </div>
      <p className="mt-3 font-mono text-[11px] text-[#F6F1E7]/70">{UPI_ID}</p>
      <p className="mt-1 font-['Fraunces',Georgia,serif] text-[26px] font-bold text-[#F5B841]">{rupees(amount)}</p>
      <button
        type="button"
        onClick={copy}
        className="mt-3 rounded-full border border-[#F6F1E7]/18 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[#F6F1E7]/70 transition-colors hover:border-[#F5B841] hover:text-[#F5B841]"
      >
        {copied ? 'Copied' : 'Copy UPI ID'}
      </button>
    </div>
  );
}

/* --------------------------------------------------------- ticket modal */

function TicketModal({ event, onClose }) {
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
    },
    [stopPolling],
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
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#04161A]/85 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${event.title} tickets`}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div className="modal-in max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[26px] border border-[#F6F1E7]/12 bg-[#0C3238] p-6 shadow-2xl sm:rounded-[26px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: event.accent }}>
              {event.date}
            </p>
            <h3 className="mt-1.5 font-['Fraunces',Georgia,serif] text-[26px] font-bold leading-[1.02] tracking-[-0.02em]">
              {event.title}
            </h3>
            <p className="mt-1.5 text-[11px] text-[#F6F1E7]/50">{event.venue}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#F6F1E7]/15 p-2 text-[#F6F1E7]/60 transition-colors hover:text-[#F6F1E7]"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {stage === 'paid' ? (
          <div className="mt-8 text-center">
            <span className="material-symbols-outlined text-[46px] text-[#7FCBA8]">check_circle</span>
            <h4 className="mt-3 font-['Fraunces',Georgia,serif] text-[24px] font-bold">You're in.</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-[#F6F1E7]/65">
              {order?.quantity || quantity} × {order?.tierName || tier.name} · {event.title}
            </p>
            <p className="mt-1 font-['Fraunces',Georgia,serif] text-[22px] font-bold text-[#F5B841]">
              ₹{order?.amount || total}
            </p>
            {order?.orderId && (
              <p className="mt-2 font-mono text-[10px] text-[#F6F1E7]/40">Order {order.orderId}</p>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-[#F6F1E7]/40">
              Show this order at the counter. Send the committee a copy on WhatsApp and they will
              keep your passes ready.
            </p>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#7FCBA8] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#082328]"
            >
              <span className="material-symbols-outlined text-[15px]">chat</span>
              Send details
            </a>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 block w-full rounded-full border border-[#F6F1E7]/18 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F6F1E7]/70"
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
                        ? 'border-[#F5B841]/70 bg-[#F5B841]/[0.09]'
                        : 'border-[#F6F1E7]/10 bg-[#082328]/40 hover:border-[#F6F1E7]/25'
                    }`}
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#F6F1E7]">{option.name}</span>
                      {option.note && <span className="block text-[10px] text-[#F6F1E7]/45">{option.note}</span>}
                    </span>
                    <span className="font-['Fraunces',Georgia,serif] text-lg font-bold text-[#F5B841]">
                      {rupees(option.price)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-[#F6F1E7]/10 bg-[#082328]/40 px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#F6F1E7]/50">Passes</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuantity((value) => Math.max(1, value - 1));
                    resetOrder();
                  }}
                  className="h-7 w-7 rounded-full border border-[#F6F1E7]/20 text-base leading-none text-[#F6F1E7]/80 hover:border-[#F5B841]"
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
                  className="h-7 w-7 rounded-full border border-[#F6F1E7]/20 text-base leading-none text-[#F6F1E7]/80 hover:border-[#F5B841]"
                  aria-label="More passes"
                >
                  +
                </button>
              </div>
            </div>

            {loggedIn && !editDetails ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#F6F1E7]/10 bg-[#082328]/40 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#F6F1E7]/40">Paying as</p>
                  <p className="truncate text-[12px] font-semibold text-[#F6F1E7]">
                    {name}
                    {phone ? ` · ${phone}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDetails(true)}
                  className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[#F5B841]"
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
                  className="w-full rounded-xl border border-[#F6F1E7]/12 bg-[#082328]/60 px-3 py-2.5 text-[11px] text-[#F6F1E7] outline-none placeholder:text-[#F6F1E7]/25 focus:border-[#F5B841]"
                />
                <input
                  value={phone}
                  onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                  inputMode="tel"
                  placeholder="Mobile number (for the pass)"
                  className="w-full rounded-xl border border-[#F6F1E7]/12 bg-[#082328]/60 px-3 py-2.5 text-[11px] text-[#F6F1E7] outline-none placeholder:text-[#F6F1E7]/25 focus:border-[#F5B841]"
                />
              </div>
            )}

            <div className="mt-4 rounded-[18px] border border-[#F6F1E7]/10 bg-[#061D22] p-4">
              <div className="flex items-center justify-between text-[11px] text-[#F6F1E7]/60">
                <span>Passes</span>
                <span>{quantity} × {rupees(tier.price)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#F6F1E7]/60">
                <span>Ticket total</span>
                <span>{rupees(total)}</span>
              </div>
              {offsetMinor > 0 && (
                <div className="mt-1 flex items-center justify-between text-[10px] text-[#F6F1E7]/40">
                  <span>Payment verification</span>
                  <span>+ ₹{(offsetMinor / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-[#F6F1E7]/10 pt-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#F6F1E7]/45">
                  Payable
                </span>
                <span className="font-['Fraunces',Georgia,serif] text-[24px] font-bold text-[#F5B841]">
                  ₹{order ? order.amount : total}
                </span>
              </div>
              {order && offsetMinor > 0 && (
                <p className="mt-2 text-[9px] leading-relaxed text-[#F6F1E7]/35">
                  A small verification amount identifies your transfer. It is part of the total
                  and goes to the Samudai.
                </p>
              )}
            </div>

            {notice && <p className="mt-3 text-center text-[11px] text-[#F5B841]/85">{notice}</p>}
            {error && <p className="mt-3 text-center text-[11px] text-[#F07882]">{error}</p>}

            {order ? (
              <button
                type="button"
                onClick={reopen}
                disabled={busy || waiting}
                className="mt-4 w-full rounded-full border border-[#F5B841]/45 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F5B841] transition-colors hover:bg-[#F5B841] hover:text-[#082328] disabled:opacity-60"
              >
                {busy ? 'Opening…' : waiting ? 'Waiting for payment…' : 'Reopen secure payment'}
              </button>
            ) : (
              <button
                type="button"
                onClick={pay}
                disabled={busy}
                className="mt-4 w-full rounded-full bg-[#C2305E] py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-white disabled:opacity-60"
              >
                {busy ? 'Opening secure payment…' : `Pay ${rupees(total)} with YouPI`}
              </button>
            )}

            <p className="mt-2 text-center text-[9px] text-[#F6F1E7]/35">
              Secure UPI checkout · YouPI · passes also at the counter
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------- membership modal */

function MembershipModal({ onClose }) {
  const token = localStorage.getItem('token');
  const [plans, setPlans] = useState({
    single: { label: 'Single', amountMinor: 60000 },
    family: { label: 'Family', amountMinor: 120000 },
    patron: { label: 'Patron', amountMinor: 500000 },
  });
  const [plan, setPlan] = useState('family');
  const [phone, setPhone] = useState(() => {
    try {
      const account = JSON.parse(localStorage.getItem('user') || 'null');
      return String(account?.mobile || account?.phone || '');
    } catch {
      return '';
    }
  });
  const [member, setMember] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const amount = Math.round((plans[plan]?.amountMinor ?? 120000) / 100);

  useEffect(() => {
    if (!token) return;
    api
      .get('/community/membership')
      .then((response) => {
        if (response.data?.plans) setPlans(response.data.plans);
        if (response.data?.member) setMember(response.data.member);
      })
      .catch(() => {});
  }, [token]);

  async function subscribe() {
    setError('');
    setSaving(true);
    try {
      const response = await api.post('/community/membership', { plan, phone });
      setMember(response.data.member);
    } catch (e) {
      setError(e?.response?.data?.error || 'Could not save your membership.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#04161A]/85 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Become a member"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div className="modal-in max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[26px] border border-[#F6F1E7]/12 bg-[#0C3238] p-6 shadow-2xl sm:rounded-[26px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#F5B841]">Membership</p>
            <h3 className="mt-1.5 font-['Fraunces',Georgia,serif] text-[26px] font-bold leading-[1.02] tracking-[-0.02em]">
              Join Konkani Samudai
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#F6F1E7]/15 p-2 text-[#F6F1E7]/60 transition-colors hover:text-[#F6F1E7]"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {!token ? (
          <div className="mt-8 text-center">
            <span className="material-symbols-outlined text-[38px] text-[#F5B841]/70">lock</span>
            <p className="mt-3 text-[13px] leading-relaxed text-[#F6F1E7]/65">
              You need an account before you can become a member. It takes a minute.
            </p>
            <Link
              to="/login"
              className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#C2305E] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-white"
            >
              Sign in to continue
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </Link>
            <p className="mt-3 text-[10px] text-[#F6F1E7]/35">
              New here? The sign-in page also creates an account.
            </p>
          </div>
        ) : member ? (
          <div className="mt-8 text-center">
            <span className="material-symbols-outlined text-[40px] text-[#7FCBA8]">verified</span>
            <h4 className="mt-3 font-['Fraunces',Georgia,serif] text-xl font-bold">You're on the list</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-[#F6F1E7]/60">
              {plans[member.plan]?.label || member.plan} membership · status{' '}
              <span className="font-semibold text-[#F5B841]">{member.status}</span>
            </p>
            <p className="mt-3 text-[10px] leading-relaxed text-[#F6F1E7]/40">
              The office confirms payments within a few hours. Bring your ID to collect the
              family card.
            </p>
            <a
              href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent(`Hi, I've paid for ${plans[member.plan]?.label || member.plan} membership.`)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex rounded-full bg-[#7FCBA8] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#082328]"
            >
              Send payment proof
            </a>
          </div>
        ) : (
          <>
            <p className="mt-3 text-[12px] leading-relaxed text-[#F6F1E7]/55">
              Pick a plan, pay by UPI, and the committee confirms you within a few hours.
            </p>

            <div className="mt-4 space-y-2">
              {Object.entries(plans).map(([key, option]) => {
                const selected = key === plan;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setPlan(key)}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-[#F5B841]/70 bg-[#F5B841]/[0.09]'
                        : 'border-[#F6F1E7]/10 bg-[#082328]/40 hover:border-[#F6F1E7]/25'
                    }`}
                  >
                    <span className="text-[13px] font-semibold text-[#F6F1E7]">{option.label}</span>
                    <span className="font-['Fraunces',Georgia,serif] text-lg font-bold text-[#F5B841]">
                      {rupees(Math.round(option.amountMinor / 100))}
                      <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#F6F1E7]/40">/ year</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {phone.trim() ? (
              <p className="mt-3 rounded-xl border border-[#F6F1E7]/10 bg-[#082328]/40 px-4 py-2.5 text-[11px] text-[#F6F1E7]/60">
                Card for <span className="font-semibold text-[#F6F1E7]">{phone}</span>
              </p>
            ) : (
              <input
                value={phone}
                onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                inputMode="tel"
                placeholder="Phone number (for the card)"
                className="mt-3 w-full rounded-xl border border-[#F6F1E7]/12 bg-[#082328]/60 px-4 py-2.5 text-[12px] text-[#F6F1E7] outline-none placeholder:text-[#F6F1E7]/25 focus:border-[#F5B841]"
              />
            )}

            <UpiBlock amount={amount} note={`Konkani Samudai ${plans[plan]?.label} membership`} />

            {error && <p className="mt-3 text-center text-[11px] text-[#F07882]">{error}</p>}

            <button
              type="button"
              onClick={subscribe}
              disabled={saving}
              className="mt-3 w-full rounded-full bg-[#C2305E] py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-white disabled:opacity-60"
            >
              {saving ? 'Saving…' : "I've paid · activate membership"}
            </button>
          </>
        )}
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
    radial-gradient(760px 420px at 22% -8%, rgba(245,184,65,0.20), transparent 62%),
    radial-gradient(620px 380px at 88% 4%, rgba(194,48,94,0.24), transparent 66%);
}
.community-page .stub {
  border-radius: 20px;
  box-shadow: 0 30px 70px -34px rgba(0,0,0,0.9);
}
.community-page .stub-primary {
  background: linear-gradient(160deg, rgba(18,71,79,0.96) 0%, rgba(12,50,56,0.98) 62%);
  border: 1px solid rgba(245,184,65,0.35);
  backdrop-filter: blur(6px);
}
.community-page .stub-ghost {
  background: linear-gradient(160deg, rgba(15,58,66,0.96) 0%, rgba(7,38,43,0.98) 70%);
  border: 1px solid rgba(246,241,231,0.12);
}
.community-page .stub-perf {
  position: relative;
  height: 1px;
  background-image: linear-gradient(90deg, rgba(246,241,231,0.28) 45%, transparent 0);
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
  background: #082328;
  transform: translateY(-50%);
}
.community-page .stub-perf::before { left: -22px; }
.community-page .stub-perf::after { right: -22px; }
.community-page .seal {
  background: radial-gradient(circle at 35% 30%, #FFD98A, #F5B841 62%, #D99A22);
  box-shadow: 0 18px 40px -18px rgba(245,184,65,0.7), inset 0 0 0 1px rgba(8,35,40,0.18);
}
.community-page .seal::after {
  content: '';
  position: absolute;
  inset: 7px;
  border-radius: 999px;
  border: 1px dashed rgba(8,35,40,0.35);
}
.community-page .card-tick {
  background: linear-gradient(165deg, rgba(18,71,79,0.75), rgba(7,38,43,0.9));
  border: 1px solid rgba(246,241,231,0.10);
  transition: transform .35s ease, border-color .35s ease, box-shadow .35s ease;
}
.community-page .card-tick:hover {
  transform: translateY(-4px);
  border-color: rgba(245,184,65,0.32);
  box-shadow: 0 30px 60px -40px rgba(0,0,0,0.9);
}
.community-page .plate {
  background: linear-gradient(160deg, rgba(18,71,79,0.55), rgba(7,38,43,0.75));
  border: 1px solid rgba(246,241,231,0.09);
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
