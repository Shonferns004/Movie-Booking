import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate } from 'react-router-dom';
import { gsap } from 'gsap';
import api from '../services/api.js';
import TicketArtwork from '../components/TicketArtwork.jsx';
import EventTicketArtwork from '../components/EventTicketArtwork.jsx';
import StyledQr from '../components/StyledQr.jsx';

const COLORS = {
  ink: '#1E2227',
  tide: '#262C33',
  shell: '#F2F0EC',
  kokum: '#C8FF1F',
  mango: '#C8FF1F',
  deep: '#171B1F',
};

function TicketPassModal({ booking, onClose, onDownload }) {
  const seats = Array.isArray(booking.seats) ? booking.seats : [];
  const date = new Date(booking.starts_at || '');
  const dateLabel = Number.isNaN(date.getTime())
    ? 'Date TBA'
    : date.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  const timeLabel = Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const seatClass = [...new Set(seats.map((seat) => seat?.category_name).filter(Boolean))].join(' · ');
  const single = seats.length === 1;

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[#14181B]/80 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Your ticket"
      onClick={onClose}
    >
      <div
        className="kk-pass-sheet max-h-[93vh] w-full overflow-y-auto rounded-t-[28px] bg-[#B5AFA6] text-[#1E2227] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.8)] sm:max-w-[820px] sm:rounded-[26px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-[#1E2227]/15 sm:hidden" />

        <div className="p-5 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#1E2227]/70">
                Booking confirmed
              </p>
              <h2 className="mt-1 truncate font-['Fraunces',Georgia,serif] text-[25px] font-bold leading-tight sm:text-[30px]">
                {booking.title}
              </h2>
              <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-[#1E2227]/70">
                {[booking.language, booking.certification].filter(Boolean).join(' · ') || 'Movie ticket'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close ticket"
              className="shrink-0 rounded-full border border-[#1E2227]/15 p-2 text-[#1E2227]/70 transition-colors hover:text-[#1E2227]"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-center sm:gap-7">
            <div className="flex flex-wrap justify-center gap-3">
              {seats.length > 0 ? (
                seats.map((seat) =>
                  seat.ticket_reference ? (
                    <div key={seat.seat_label} className="flex flex-col items-center">
                      <div className="overflow-hidden rounded-2xl border border-[#1E2227]/10">
                        <StyledQr
                          value={seat.ticket_reference}
                          size={single ? 196 : 128}
                          background="#FFFFFF"
                          accent="#1E2227"
                          margin={8}
                        />
                      </div>
                      <span className="mt-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-[#1E2227]/70">
                        {seat.seat_label}
                      </span>
                    </div>
                  ) : null,
                )
              ) : (
                <p className="py-8 text-center text-[11px] text-[#1E2227]/70">QR issued after payment.</p>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase leading-relaxed tracking-[0.12em]">
                {[booking.theatre_name, booking.auditorium_name].filter(Boolean).join(' · ')}
              </p>

              <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-[#C8FF1F] px-4 py-3 text-[#1E2227]">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#1E2227]/70">Date</p>
                  <p className="mt-0.5 text-[11px] font-semibold">{dateLabel}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#1E2227]/70">Time</p>
                  <p className="mt-0.5 text-[11px] font-semibold">{timeLabel}</p>
                </div>
                <div className="text-right">
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#1E2227]/70">Seats</p>
                  <p className="mt-0.5 text-[11px] font-semibold">
                    {seats.map((seat) => seat.seat_label).join(', ') || '—'}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[9px] uppercase tracking-[0.14em] text-[#1E2227]/70">
                <span>{seatClass || 'Standard'}</span>
                <span className="truncate font-mono tracking-[0.04em]">{booking.booking_reference}</span>
              </div>

              <button
                type="button"
                onClick={() => onDownload(booking)}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#1E2227] py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F2F0EC] transition-transform hover:-translate-y-0.5"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                Download ticket
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function MyTickets() {
  const [bookings, setBookings] = useState([]);
  const [eventPasses, setEventPasses] = useState([]);
  const [eventBackground, setEventBackground] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  const [printBooking, setPrintBooking] = useState(null);
  const [previewBooking, setPreviewBooking] = useState(null);
  const pageRef = useRef(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (pageRef.current) {
      gsap.fromTo(
        pageRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', clearProps: 'transform' },
      );
    }
    const onMove = (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 20;
      const y = (event.clientY / window.innerHeight - 0.5) * 20;
      gsap.to('.kk-blob', { x, y, duration: 1, ease: 'power2.out' });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [loading]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return undefined;
    }
    let stop = false;
    Promise.allSettled([
      api.get('/bookings/me/tickets'),
      api.get('/community/events/tickets/me'),
      api.get('/community'),
    ])
      .then(([bookingsResult, passesResult, communityResult]) => {
        if (stop) return;

        if (bookingsResult.status === 'fulfilled') {
          const rows = Array.isArray(bookingsResult.value.data) ? bookingsResult.value.data : [];
          // Pending bookings are still being paid for: never show them as passes.
          setBookings(rows.filter((booking) => booking.status !== 'pending'));
        } else {
          const err = bookingsResult.reason;
          setError(err?.response?.data?.error || err?.message || 'Unable to load your tickets.');
        }

        if (passesResult.status === 'fulfilled' && Array.isArray(passesResult.value.data)) {
          setEventPasses(passesResult.value.data);
        }

        if (communityResult.status === 'fulfilled') {
          setEventBackground(communityResult.value.data?.eventTicket?.backgroundUrl || '');
        }
      })
      .finally(() => {
        if (!stop) setLoading(false);
      });
    return () => {
      stop = true;
    };
  }, [token]);

  // Print-to-PDF: the browser print dialog produces a real PDF of the ticket.
  useEffect(() => {
    if (!printBooking) return undefined;
    const done = () => setPrintBooking(null);
    window.addEventListener('afterprint', done);
    const timer = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printBooking]);

  const filtered = useMemo(() => {
    if (filter === 'upcoming') {
      return bookings.filter(
        (booking) => booking.status !== 'cancelled' && new Date(booking.starts_at).getTime() >= now,
      );
    }
    if (filter === 'past') {
      return bookings.filter(
        (booking) => booking.status !== 'cancelled' && new Date(booking.starts_at).getTime() < now,
      );
    }
    if (filter === 'cancelled') return bookings.filter((booking) => booking.status === 'cancelled');
    return bookings;
  }, [bookings, filter, now]);

  const filteredEvents = useMemo(() => {
    if (filter === 'cancelled') return [];
    if (filter === 'upcoming') {
      return eventPasses.filter(
        (pass) => !pass.eventStartsAt || new Date(pass.eventStartsAt).getTime() >= now,
      );
    }
    if (filter === 'past') {
      return eventPasses.filter(
        (pass) => pass.eventStartsAt && new Date(pass.eventStartsAt).getTime() < now,
      );
    }
    return eventPasses;
  }, [eventPasses, filter, now]);

  const filters = [
    { key: 'all', label: 'All passes' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past shows' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main ref={pageRef} className="kk-wallet min-h-screen w-full pb-16 pt-24" style={{ background: COLORS.ink, color: COLORS.shell }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Public+Sans:wght@400;500;600;700&display=swap');
        .kk-wallet{font-family:'Public Sans',system-ui,sans-serif}
        .kk-ticket-display{font-family:'Fraunces',Georgia,serif}
        .kk-wallet-card{background:${COLORS.tide};border:1px solid rgba(242,240,236,.1);box-shadow:0 12px 36px rgba(0,0,0,.15)}
        .kk-wallet-tab{transition:background .2s ease,color .2s ease,transform .2s ease}
        .kk-wallet-tab:focus-visible{outline:2px solid ${COLORS.mango};outline-offset:2px}
        .kk-ticket-art{transition:transform .25s ease,box-shadow .25s ease;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .kk-ticket-art:hover{transform:translateY(-2px);box-shadow:0 34px 80px -38px rgba(0,0,0,.95)}
        .kk-print-root{display:none}
        .kk-pass-sheet{animation:kkSheetUp .34s cubic-bezier(.22,1,.36,1)}
        @keyframes kkSheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes kkPassIn{from{opacity:0;transform:translateY(8px) scale(.975)}to{opacity:1;transform:none}}
        @media(min-width:640px){.kk-pass-sheet{animation:kkPassIn .26s ease-out}}
        @media(prefers-reduced-motion:reduce){.kk-pass-sheet{animation:none}}
        @media print{
          body{background:#fff!important}
          body *{visibility:hidden}
          .kk-print-root,.kk-print-root *{visibility:visible}
          .kk-print-root{display:block;position:fixed;inset:0;padding:10mm;background:#fff;--kk-ticket-bg:#fff}
          .kk-print-root .kk-ticket-art{box-shadow:none}
          @page{size:A4 landscape;margin:0}
        }
        @media(prefers-reduced-motion:reduce){.kk-ticket-art,.kk-wallet-tab{transition:none}}
      `}</style>

      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="kk-blob absolute -top-48 left-1/2 h-[440px] w-[720px] -translate-x-1/2 rounded-full blur-[140px]" style={{ background: `${COLORS.tide}90` }} />
        <div className="kk-blob absolute right-[-100px] top-[40%] h-64 w-64 rounded-full blur-[110px]" style={{ background: `${COLORS.kokum}12` }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <div className="mb-7 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ background: COLORS.mango, color: COLORS.ink }}>
                <span className="text-2xl" aria-hidden="true">▣</span>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.2em]" style={{ color: COLORS.mango }}>Samudai member wallet</p>
                <p className="kk-ticket-display text-2xl font-bold">My tickets</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs" style={{ borderColor: `${COLORS.shell}24`, background: `${COLORS.tide}80`, color: `${COLORS.shell}C9` }}>
              <span className="h-2 w-2 rounded-full" style={{ background: '#B6E36A' }} />
              Digital QR entry
            </div>
          </div>
        </header>

        <section className="mb-6 rounded-2xl p-2" style={{ background: COLORS.tide }}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="tablist" aria-label="Filter tickets">
            {filters.map((item) => {
              const active = filter === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(item.key)}
                  className="kk-wallet-tab rounded-xl px-3 py-3 text-xs font-bold sm:text-sm"
                  style={{ background: active ? COLORS.mango : 'transparent', color: active ? COLORS.ink : `${COLORS.shell}B8` }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="mb-5 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: `${COLORS.kokum}80`, background: `${COLORS.kokum}18`, color: COLORS.shell }}>
            <span className="mr-2" aria-hidden="true">!</span>{error}
          </div>
        )}

        <section className="flex flex-col gap-6">
          {loading && (
            <div className="kk-wallet-card flex items-center justify-center gap-3 rounded-2xl p-12 text-sm" style={{ color: `${COLORS.shell}B8` }}>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-dashed" style={{ borderColor: COLORS.mango, borderTopColor: 'transparent' }} />
              Loading your passes…
            </div>
          )}

          {!loading && filtered.length === 0 && filteredEvents.length === 0 && (
            <div className="kk-wallet-card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: COLORS.mango, color: COLORS.ink }}>▣</div>
              <h2 className="kk-ticket-display text-3xl font-bold">
                {bookings.length || eventPasses.length ? 'Nothing in this filter' : 'Your wallet is waiting'}
              </h2>
              <p className="mt-3 max-w-md text-sm leading-6" style={{ color: `${COLORS.shell}A8` }}>
                {bookings.length || eventPasses.length
                  ? 'Try another filter to see your other Konkani Samudai passes.'
                  : 'Book a show and your digital pass with individual gate QR codes will appear here.'}
              </p>
              <Link to="/movies" className="mt-6 rounded-xl px-5 py-3 text-sm font-bold text-[#1E2227]" style={{ background: COLORS.kokum }}>
                Browse movies →
              </Link>
            </div>
          )}

          {filtered.map((booking) => (
            <div
              key={booking.id}
              role="button"
              tabIndex={0}
              onClick={() => setPreviewBooking(booking)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setPreviewBooking(booking);
                }
              }}
              className="min-w-0 cursor-pointer rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8FF1F]"
            >
              <TicketArtwork booking={booking} />
            </div>
          ))}

          {filteredEvents.map((pass) => (
            <Link
              key={pass.id}
              to={`/event-ticket/${pass.orderId}`}
              className="group block rounded-[22px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8FF1F]"
            >
              <EventTicketArtwork ticket={pass} backgroundUrl={eventBackground} />
              <p className="mt-2 flex items-center gap-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[#F2F0EC]/40">
                <span className="material-symbols-outlined text-[14px] text-[#C8FF1F]">confirmation_number</span>
                Event pass · tap to open &amp; download
              </p>
            </Link>
          ))}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border px-4 py-4 text-xs" style={{ borderColor: `${COLORS.shell}14`, background: `${COLORS.tide}80`, color: `${COLORS.shell}A8` }}>
          <span>✓ Instant QR entry</span>
          <span style={{ color: COLORS.mango }}>✦</span>
          <span>8-minute seat hold</span>
          <span style={{ color: COLORS.mango }}>✦</span>
          <span>Konkani Samudai Theatres</span>
        </footer>
      </div>

      {previewBooking && (
        <TicketPassModal
          booking={previewBooking}
          onClose={() => setPreviewBooking(null)}
          onDownload={(booking) => {
            setPreviewBooking(null);
            setPrintBooking(booking);
          }}
        />
      )}

      {printBooking && (
        <div className="kk-print-root">
          <TicketArtwork booking={printBooking} />
        </div>
      )}
    </main>
  );
}
