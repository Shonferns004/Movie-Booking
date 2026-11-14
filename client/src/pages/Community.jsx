import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

/**
 * Community landing page.
 *
 * This is the public face of Konkani Samudai: events, notices, the archive and a way to
 * join. Event ticketing happens over UPI (QR + VPA), with the buyer sending the details
 * on WhatsApp so the committee can issue a pass - no gateway product needed for
 * community events.
 */

const UPI_ID = '7506419340-1@naviaxis';
const WHATSAPP = '917506419340';

const UPCOMING = [
  {
    id: 'food-festival',
    title: 'Konkani Food Festival',
    date: 'Sat, 22 Nov 2026',
    time: '11:00 AM - 9:00 PM',
    venue: 'Samudai Grounds, Margao',
    blurb: 'Forty home kitchens, one afternoon. Solkadhi, bangda fry, patoleo and the annual sorpotel contest.',
    tags: ['Food', 'Family'],
    accent: '#F4B63F',
    tiers: [
      { id: 'general', name: 'General entry', price: 299, note: 'All stalls, entry from 11 AM' },
      { id: 'patron', name: 'Patron pass', price: 999, note: 'Entry + tasting table + reserved seating' },
    ],
  },
  {
    id: 'fugdi-night',
    title: 'Fugdi & Dhol Night',
    date: 'Sat, 29 Nov 2026',
    time: '7:30 PM onwards',
    venue: 'Samudai Hall, Margao',
    blurb: 'Live dhol, fugdi circles and a Konkani folk set from the youth wing. Dinner included.',
    tags: ['Music', 'Dance'],
    accent: '#C2305E',
    tiers: [
      { id: 'general', name: 'General entry', price: 499, note: 'Standing + dinner' },
      { id: 'table', name: 'Table of 4', price: 1799, note: 'Reserved table, front section' },
    ],
  },
  {
    id: 'christmas-market',
    title: 'Christmas Mangalore Market',
    date: 'Sun, 21 Dec 2026',
    time: '10:00 AM - 6:00 PM',
    venue: 'Church Square, Margao',
    blurb: 'Kuswar, hand-painted baubles, and the children\'s choir at 5 PM.',
    tags: ['Market', 'Festive'],
    accent: '#78C9A6',
    tiers: [
      { id: 'general', name: 'Entry', price: 199, note: 'Children under 10 free' },
    ],
  },
];

const PAST = [
  { year: '2026', title: 'Monti Fest', detail: '420 families, 1,100 plates of shevyo.' },
  { year: '2026', title: 'Konkani Film Week', detail: '12 films, 6 directors, 3 sold-out evenings.' },
  { year: '2025', title: 'Utorda Beach Clean-up', detail: '120 volunteers, 800 kg of waste.' },
  { year: '2025', title: 'First Cookbook Launch', detail: '68 family recipes collected and printed.' },
];

const NOTICES = [
  {
    date: '12 Nov 2026',
    title: 'Membership renewals open',
    body: 'Renew before 31 December to keep your family voting rights and event discounts.',
    tag: 'Membership',
  },
  {
    date: '08 Nov 2026',
    title: 'Scholarship applications',
    body: 'Open to members\' children in classes 10-12. Last date 30 November 2026.',
    tag: 'Education',
  },
  {
    date: '02 Nov 2026',
    title: 'Konkani classes moved',
    body: 'Sunday classes now start at 9:30 AM in the annexe room instead of 8:00 AM.',
    tag: 'Classes',
  },
  {
    date: '28 Oct 2026',
    title: 'AGM agenda published',
    body: 'Accounts for 2025-26, the events calendar and the new committee list are on the noticeboard.',
    tag: 'Committee',
  },
];

const STATS = [
  { value: '1,200+', label: 'member families' },
  { value: '24', label: 'events a year' },
  { value: '3', label: 'generations' },
];

const NAV = [
  { href: '#events', label: 'Events' },
  { href: '#notices', label: 'Notices' },
  { href: '#archive', label: 'Our story' },
  { href: '#join', label: 'Join' },
];

function formatRupees(value) {
  return `₹${Number(value).toLocaleString('en-IN')}`;
}

export default function Community() {
  const [ticketEvent, setTicketEvent] = useState(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!ticketEvent) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setTicketEvent(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ticketEvent]);

  return (
    <div className="min-h-screen bg-[#0A2A31] text-[#EFEBE0]">
      <SubNav scrolled={scrolled} />

      <Hero />
      <Events onPick={setTicketEvent} />
      <Notices />
      <Archive />
      <Join />
      <Footer />

      {ticketEvent && (
        <TicketModal event={ticketEvent} onClose={() => setTicketEvent(null)} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ nav */

function SubNav({ scrolled }) {
  return (
    <div
      className={`sticky top-[72px] z-40 border-b transition-colors duration-300 ${
        scrolled
          ? 'border-[#EFEBE0]/10 bg-[#071E23]/95 backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
        {NAV.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="whitespace-nowrap rounded-full px-4 py-2 text-xs font-semibold text-[#EFEBE0]/70 transition-colors hover:bg-[#EFEBE0]/10 hover:text-[#EFEBE0]"
          >
            {item.label}
          </a>
        ))}
        <span className="ml-auto hidden sm:block">
          <Link
            to="/movies"
            className="inline-flex items-center gap-2 rounded-full bg-[#F4B63F] px-4 py-2 text-xs font-bold text-[#0A2A31] transition-transform hover:-translate-y-0.5"
          >
            <span className="material-symbols-outlined text-[16px]">movie</span>
            Book movie tickets
          </Link>
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 420px at 15% -10%, rgba(244,182,63,0.22), transparent 60%), radial-gradient(700px 420px at 85% 10%, rgba(194,48,94,0.28), transparent 65%)',
        }}
      />
      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:px-8 lg:pb-24 lg:pt-20">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-[#F4B63F]/40 bg-[#F4B63F]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-[#F4B63F]">
            <span className="material-symbols-outlined text-[14px]">diversity_3</span>
            Margao · since 1934
          </span>

          <h1 className="mt-6 font-['Fraunces',Georgia,serif] text-[42px] font-black leading-[1.02] tracking-tight sm:text-[58px] lg:text-[64px]">
            One community.
            <br />
            A thousand <span className="italic text-[#F4B63F]">stories</span>.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-[#EFEBE0]/75">
            Konkani Samudai is the home of our festivals, our food, our films and our
            people. Come for the Fugdi night, stay for the Sunday classes, bring the
            children to the Christmas market.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#events"
              className="inline-flex min-h-12 items-center gap-2 rounded-full bg-[#C2305E] px-6 text-sm font-bold text-white shadow-lg shadow-black/25 transition-transform hover:-translate-y-0.5"
            >
              <span className="material-symbols-outlined text-[18px]">event</span>
              Explore events
            </a>
            <Link
              to="/movies"
              className="inline-flex min-h-12 items-center gap-2 rounded-full border border-[#EFEBE0]/25 px-6 text-sm font-semibold text-[#EFEBE0] transition-colors hover:border-[#F4B63F] hover:text-[#F4B63F]"
            >
              <span className="material-symbols-outlined text-[18px]">theaters</span>
              Book movie tickets
            </Link>
          </div>

          <dl className="mt-10 grid max-w-lg grid-cols-3 gap-4">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-[#EFEBE0]/10 bg-[#123E47]/70 px-4 py-3"
              >
                <dt className="font-['Fraunces',Georgia,serif] text-2xl font-black text-[#F4B63F]">
                  {stat.value}
                </dt>
                <dd className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#EFEBE0]/55">
                  {stat.label}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Featured event card */}
        <div className="relative">
          <div className="absolute -inset-3 rounded-[34px] bg-[#F4B63F]/10 blur-2xl" aria-hidden="true" />
          <article className="relative overflow-hidden rounded-[28px] border border-[#EFEBE0]/12 bg-[#123E47] p-6 shadow-2xl shadow-black/30">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#EFEBE0]/55">
                Next up
              </span>
              <span className="rounded-full bg-[#C2305E] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                22 Nov
              </span>
            </div>

            <div
              className="mt-5 flex h-40 items-center justify-center rounded-2xl border border-[#EFEBE0]/10"
              style={{
                background:
                  'linear-gradient(135deg, rgba(244,182,63,0.35), rgba(194,48,94,0.35))',
              }}
            >
              <span className="material-symbols-outlined text-[56px] text-[#0A2A31]/60">
                restaurant
              </span>
            </div>

            <h2 className="mt-5 font-['Fraunces',Georgia,serif] text-2xl font-black leading-tight">
              Konkani Food Festival
            </h2>
            <p className="mt-2 text-sm text-[#EFEBE0]/70">
              Forty home kitchens · sorpotel contest · live tiatr stage.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-[#EFEBE0]/70">
              <span className="inline-flex items-center gap-1 rounded-full border border-[#EFEBE0]/12 px-2.5 py-1">
                <span className="material-symbols-outlined text-[13px]">schedule</span>
                11 AM - 9 PM
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-[#EFEBE0]/12 px-2.5 py-1">
                <span className="material-symbols-outlined text-[13px]">location_on</span>
                Samudai Grounds
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-[#EFEBE0]/10 pt-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#EFEBE0]/50">
                  From
                </p>
                <p className="font-['Fraunces',Georgia,serif] text-xl font-black text-[#F4B63F]">
                  ₹299
                </p>
              </div>
              <button
                type="button"
                onClick={() => document.getElementById('events')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-2 rounded-full bg-[#EFEBE0] px-5 py-2.5 text-xs font-bold text-[#0A2A31] transition-transform hover:-translate-y-0.5"
              >
                Get tickets
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- events */

function Events({ onPick }) {
  return (
    <section id="events" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <SectionHeading
        eyebrow="What's coming"
        title="Upcoming events"
        action={
          <span className="hidden text-xs text-[#EFEBE0]/55 sm:block">
            Tickets are sold online via UPI · passes at the counter too
          </span>
        }
      />

      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {UPCOMING.map((event) => {
          const from = Math.min(...event.tiers.map((tier) => tier.price));
          return (
            <article
              key={event.id}
              className="group flex flex-col overflow-hidden rounded-3xl border border-[#EFEBE0]/10 bg-[#123E47]/70 transition-transform duration-300 hover:-translate-y-1"
            >
              <div
                className="relative flex h-36 items-end p-4"
                style={{
                  background: `linear-gradient(150deg, ${event.accent}44, ${event.accent}11 55%, transparent)`,
                }}
              >
                <div className="flex flex-wrap gap-1.5">
                  {event.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-[#0A2A31]/70 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#EFEBE0]/80"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span
                  className="absolute right-4 top-4 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-[#0A2A31]"
                  style={{ background: event.accent }}
                >
                  {event.date.split(',')[1]?.trim() || event.date}
                </span>
              </div>

              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-['Fraunces',Georgia,serif] text-xl font-black leading-tight">
                  {event.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[#EFEBE0]/70">{event.blurb}</p>

                <div className="mt-4 space-y-1.5 text-[11px] text-[#EFEBE0]/60">
                  <p className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]">calendar_month</span>
                    {event.date} · {event.time}
                  </p>
                  <p className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                    {event.venue}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-[#EFEBE0]/10 pt-4">
                  <p className="text-xs text-[#EFEBE0]/60">
                    From{' '}
                    <span className="font-['Fraunces',Georgia,serif] text-lg font-black text-[#F4B63F]">
                      {formatRupees(from)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => onPick(event)}
                    className="inline-flex items-center gap-2 rounded-full bg-[#C2305E] px-4 py-2 text-xs font-bold text-white transition-transform group-hover:-translate-y-0.5"
                  >
                    Get tickets
                    <span className="material-symbols-outlined text-[15px]">confirmation_number</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- notices */

function Notices() {
  return (
    <section id="notices" className="border-y border-[#EFEBE0]/10 bg-[#071E23]/60">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="Noticeboard" title="From the committee" />

        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {NOTICES.map((notice) => (
            <article
              key={notice.title}
              className="rounded-2xl border border-[#EFEBE0]/10 bg-[#123E47]/60 p-5 transition-colors hover:border-[#F4B63F]/35"
            >
              <div className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#EFEBE0]/45">
                <span className="rounded-full bg-[#F4B63F]/15 px-2.5 py-1 text-[#F4B63F]">
                  {notice.tag}
                </span>
                {notice.date}
              </div>
              <h3 className="mt-3 font-['Fraunces',Georgia,serif] text-lg font-bold">
                {notice.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#EFEBE0]/70">{notice.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- archive */

function Archive() {
  return (
    <section id="archive" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
      <SectionHeading eyebrow="Our story" title="What we've already done" />

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PAST.map((item) => (
          <article
            key={item.title}
            className="relative overflow-hidden rounded-2xl border border-[#EFEBE0]/10 bg-[#123E47]/50 p-5"
          >
            <span className="absolute -right-4 -top-6 font-['Fraunces',Georgia,serif] text-7xl font-black text-[#EFEBE0]/[0.05]">
              {item.year}
            </span>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4B63F]">
              {item.year}
            </p>
            <h3 className="mt-2 font-['Fraunces',Georgia,serif] text-lg font-bold leading-tight">
              {item.title}
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-[#EFEBE0]/65">{item.detail}</p>
          </article>
        ))}
      </div>

      <div className="mt-10 flex flex-col gap-4 rounded-3xl border border-[#F4B63F]/25 bg-[#F4B63F]/[0.07] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-['Fraunces',Georgia,serif] text-xl font-black">
            Also running: our screenhouse
          </h3>
          <p className="mt-1 text-sm text-[#EFEBE0]/70">
            Konkani and world cinema, four screens, tickets from ₹150.
          </p>
        </div>
        <Link
          to="/movies"
          className="inline-flex items-center gap-2 self-start rounded-full bg-[#EFEBE0] px-5 py-2.5 text-xs font-bold text-[#0A2A31] transition-transform hover:-translate-y-0.5"
        >
          See what's showing
          <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
        </Link>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- join */

function Join() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [interest, setInterest] = useState('Events');
  const [sent, setSent] = useState(false);

  function submit(event) {
    event.preventDefault();
    if (!name.trim() || !email.trim()) return;
    setSent(true);
  }

  return (
    <section id="join" className="border-t border-[#EFEBE0]/10 bg-[#071E23]/60">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:px-8 lg:py-20">
        <div>
          <SectionHeading eyebrow="Join us" title="Become part of the Samudai" />
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[#EFEBE0]/70">
            Membership gets your family voting rights at the AGM, discounts on every
            event, priority movie seats and a place in the Sunday classes.
          </p>

          <ul className="mt-6 space-y-3 text-sm text-[#EFEBE0]/75">
            {[
              'Family membership · ₹1,200 a year',
              'Event discounts for every member',
              'Scholarships for members\' children',
              'Konkani classes, choir and the youth wing',
            ].map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="material-symbols-outlined text-[18px] text-[#78C9A6]">
                  check_circle
                </span>
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href={`https://wa.me/${WHATSAPP}?text=${encodeURIComponent('Hi! I would like to join Konkani Samudai.')}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-[#78C9A6] px-5 py-2.5 text-xs font-bold text-[#0A2A31] transition-transform hover:-translate-y-0.5"
            >
              <span className="material-symbols-outlined text-[16px]">chat</span>
              Message on WhatsApp
            </a>
            <a
              href={`mailto:hello@konkanisamudai.org?subject=${encodeURIComponent('Membership enquiry')}`}
              className="inline-flex items-center gap-2 rounded-full border border-[#EFEBE0]/20 px-5 py-2.5 text-xs font-semibold text-[#EFEBE0]/80 transition-colors hover:border-[#F4B63F] hover:text-[#F4B63F]"
            >
              <span className="material-symbols-outlined text-[16px]">mail</span>
              Email the office
            </a>
          </div>
        </div>

        <div className="rounded-3xl border border-[#EFEBE0]/12 bg-[#123E47]/70 p-6 sm:p-8">
          {sent ? (
            <div className="flex h-full flex-col items-center justify-center py-10 text-center">
              <span className="material-symbols-outlined text-[44px] text-[#78C9A6]">
                mark_email_read
              </span>
              <h3 className="mt-3 font-['Fraunces',Georgia,serif] text-xl font-black">
                Thank you, {name.split(' ')[0]}
              </h3>
              <p className="mt-2 max-w-xs text-sm text-[#EFEBE0]/70">
                The office will reach out at {email} about {interest.toLowerCase()}.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSent(false);
                  setName('');
                  setEmail('');
                }}
                className="mt-5 text-xs font-semibold text-[#F4B63F]"
              >
                Send another
              </button>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h3 className="font-['Fraunces',Georgia,serif] text-xl font-black">
                Tell us a little about you
              </h3>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#EFEBE0]/55">
                  Your name
                </span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                  placeholder="Maria Fernandes"
                  className="mt-1.5 w-full rounded-xl border border-[#EFEBE0]/15 bg-[#0A2A31]/60 px-4 py-3 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30 focus:border-[#F4B63F]"
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#EFEBE0]/55">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  placeholder="you@example.com"
                  className="mt-1.5 w-full rounded-xl border border-[#EFEBE0]/15 bg-[#0A2A31]/60 px-4 py-3 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30 focus:border-[#F4B63F]"
                />
              </label>

              <label className="block">
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#EFEBE0]/55">
                  I'm interested in
                </span>
                <select
                  value={interest}
                  onChange={(event) => setInterest(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[#EFEBE0]/15 bg-[#0A2A31]/60 px-4 py-3 text-sm text-[#EFEBE0] outline-none focus:border-[#F4B63F]"
                >
                  <option>Events</option>
                  <option>Membership</option>
                  <option>Konkani classes</option>
                  <option>Volunteering</option>
                  <option>Sponsorship</option>
                </select>
              </label>

              <button
                type="submit"
                className="mt-2 w-full rounded-full bg-[#C2305E] py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5"
              >
                Count me in
              </button>
              <p className="text-center text-[10px] text-[#EFEBE0]/40">
                We only use these details to reach you about the Samudai.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- bits */

function SectionHeading({ eyebrow, title, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F4B63F]">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-['Fraunces',Georgia,serif] text-[30px] font-black leading-tight tracking-tight sm:text-[38px]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#EFEBE0]/10 bg-[#071E23]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div>
          <p className="font-['Fraunces',Georgia,serif] text-lg font-black">
            Konkani <span className="italic text-[#F4B63F]">Samudai</span>
          </p>
          <p className="mt-1 text-xs text-[#EFEBE0]/55">
            Cinema, screenhouse and community · Margao, Goa
          </p>
        </div>
        <ul className="flex flex-wrap gap-5 text-xs text-[#EFEBE0]/60">
          <li>
            <a className="hover:text-[#F4B63F]" href="#events">
              Events
            </a>
          </li>
          <li>
            <a className="hover:text-[#F4B63F]" href="#notices">
              Notices
            </a>
          </li>
          <li>
            <Link className="hover:text-[#F4B63F]" to="/movies">
              Movies
            </Link>
          </li>
          <li>
            <Link className="hover:text-[#F4B63F]" to="/my-tickets">
              My tickets
            </Link>
          </li>
        </ul>
      </div>
    </footer>
  );
}

/* --------------------------------------------------------- ticket modal */

function TicketModal({ event, onClose }) {
  const [tierId, setTierId] = useState(event.tiers[0].id);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState('');
  const [copied, setCopied] = useState(false);

  const tier = useMemo(
    () => event.tiers.find((item) => item.id === tierId) || event.tiers[0],
    [event, tierId],
  );
  const total = tier.price * quantity;

  const upiLink = useMemo(
    () =>
      `upi://pay?pa=${encodeURIComponent(UPI_ID)}&pn=${encodeURIComponent('Konkani Samudai')}` +
      `&am=${total}&cu=INR&tn=${encodeURIComponent(`${event.title} · ${tier.name} x${quantity}`)}`,
    [event, tier, total, quantity],
  );

  const whatsappLink = useMemo(() => {
    const lines = [
      `Event: ${event.title}`,
      `Pass: ${tier.name}`,
      `Quantity: ${quantity}`,
      `Total: ${formatRupees(total)}`,
      name.trim() ? `Name: ${name.trim()}` : null,
      `Paid to: ${UPI_ID}`,
    ].filter(Boolean);
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [event, tier, quantity, total, name]);

  async function copyUpi() {
    try {
      await navigator.clipboard.writeText(UPI_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${event.title} tickets`}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#EFEBE0]/12 bg-[#0D343B] p-6 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#F4B63F]">
              {event.date} · {event.time}
            </p>
            <h3 className="mt-1 font-['Fraunces',Georgia,serif] text-2xl font-black leading-tight">
              {event.title}
            </h3>
            <p className="mt-1 text-xs text-[#EFEBE0]/60">{event.venue}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#EFEBE0]/15 p-2 text-[#EFEBE0]/70 transition-colors hover:text-[#EFEBE0]"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="mt-5 space-y-2">
          {event.tiers.map((option) => {
            const selected = option.id === tierId;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setTierId(option.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected
                    ? 'border-[#F4B63F] bg-[#F4B63F]/10'
                    : 'border-[#EFEBE0]/12 bg-[#0A2A31]/40 hover:border-[#EFEBE0]/25'
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold">{option.name}</span>
                  <span className="block text-[11px] text-[#EFEBE0]/55">{option.note}</span>
                </span>
                <span className="font-['Fraunces',Georgia,serif] text-lg font-black text-[#F4B63F]">
                  {formatRupees(option.price)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#EFEBE0]/12 bg-[#0A2A31]/40 px-4 py-3">
          <span className="text-sm text-[#EFEBE0]/75">Passes</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="h-8 w-8 rounded-full border border-[#EFEBE0]/20 text-lg leading-none hover:border-[#F4B63F]"
              aria-label="Fewer passes"
            >
              −
            </button>
            <span className="w-6 text-center text-sm font-bold">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((value) => Math.min(10, value + 1))}
              className="h-8 w-8 rounded-full border border-[#EFEBE0]/20 text-lg leading-none hover:border-[#F4B63F]"
              aria-label="More passes"
            >
              +
            </button>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-[#EFEBE0]/12 bg-[#071E23]/70 p-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/50">
            Pay by UPI
          </p>
          <div className="mx-auto mt-3 w-fit rounded-2xl bg-white p-3">
            <QRCodeSVG value={upiLink} size={148} level="M" includeMargin={false} />
          </div>
          <p className="mt-3 font-mono text-xs text-[#EFEBE0]/80">{UPI_ID}</p>
          <p className="mt-1 font-['Fraunces',Georgia,serif] text-2xl font-black text-[#F4B63F]">
            {formatRupees(total)}
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={copyUpi}
              className="rounded-full border border-[#EFEBE0]/20 px-4 py-2 text-[11px] font-semibold text-[#EFEBE0]/80 transition-colors hover:border-[#F4B63F] hover:text-[#F4B63F]"
            >
              {copied ? 'UPI ID copied' : 'Copy UPI ID'}
            </button>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="rounded-full bg-[#78C9A6] px-4 py-2 text-[11px] font-bold text-[#0A2A31]"
            >
              I've paid · send details
            </a>
          </div>

          <input
            value={name}
            onChange={(changeEvent) => setName(changeEvent.target.value)}
            placeholder="Your name (for the pass)"
            className="mt-4 w-full rounded-xl border border-[#EFEBE0]/15 bg-[#0A2A31]/60 px-4 py-2.5 text-center text-xs text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30 focus:border-[#F4B63F]"
          />
          <p className="mt-2 text-[10px] leading-relaxed text-[#EFEBE0]/40">
            Scan with any UPI app, then send us the payment screenshot on WhatsApp. The
            committee confirms passes within a few hours.
          </p>
        </div>
      </div>
    </div>
  );
}
