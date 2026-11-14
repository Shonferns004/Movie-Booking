import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { gsap } from 'gsap';
import api from '../services/api.js';
import TicketArtwork from '../components/TicketArtwork.jsx';

const COLORS = {
  ink: '#0A2A31',
  tide: '#123E47',
  shell: '#EFEBE0',
  kokum: '#C2305E',
  mango: '#F4B63F',
  deep: '#071E23',
};

export default function MyTickets() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  const [printBooking, setPrintBooking] = useState(null);
  const pageRef = useRef(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (pageRef.current) {
      gsap.fromTo(
        pageRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' },
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
    api
      .get('/bookings/me/tickets')
      .then((response) => {
        // Pending bookings are still being paid for: never show them as passes.
        const rows = Array.isArray(response.data) ? response.data : [];
        if (!stop) setBookings(rows.filter((booking) => booking.status !== 'pending'));
      })
      .catch((err) => {
        if (!stop) setError(err.response?.data?.error || err.message || 'Unable to load your tickets.');
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
        .kk-wallet-card{background:${COLORS.tide};border:1px solid rgba(239,235,224,.1);box-shadow:0 12px 36px rgba(0,0,0,.15)}
        .kk-wallet-tab{transition:background .2s ease,color .2s ease,transform .2s ease}
        .kk-wallet-tab:focus-visible{outline:2px solid ${COLORS.mango};outline-offset:2px}
        .kk-ticket-art{transition:transform .25s ease,box-shadow .25s ease;print-color-adjust:exact;-webkit-print-color-adjust:exact}
        .kk-ticket-art:hover{transform:translateY(-2px);box-shadow:0 34px 80px -38px rgba(0,0,0,.95)}
        .kk-print-root{display:none}
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
              <span className="h-2 w-2 rounded-full" style={{ background: '#67C69A' }} />
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

          {!loading && filtered.length === 0 && (
            <div className="kk-wallet-card flex flex-col items-center rounded-3xl px-6 py-14 text-center">
              <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: COLORS.mango, color: COLORS.ink }}>▣</div>
              <h2 className="kk-ticket-display text-3xl font-bold">{bookings.length ? 'Nothing in this filter' : 'Your wallet is waiting'}</h2>
              <p className="mt-3 max-w-md text-sm leading-6" style={{ color: `${COLORS.shell}A8` }}>
                {bookings.length
                  ? 'Try another filter to see your other Konkani Samudai bookings.'
                  : 'Book a show and your digital pass with individual gate QR codes will appear here.'}
              </p>
              <Link to="/movies" className="mt-6 rounded-xl px-5 py-3 text-sm font-bold text-white" style={{ background: COLORS.kokum }}>
                Browse movies →
              </Link>
            </div>
          )}

          {filtered.map((booking) => (
            <div key={booking.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <TicketArtwork booking={booking} />
              </div>
              <button
                type="button"
                onClick={() => setPrintBooking(booking)}
                aria-label="Download ticket PDF"
                title="Download PDF"
                className="flex h-12 w-12 shrink-0 items-center justify-center self-end rounded-full border border-[#EFEBE0]/20 bg-[#123E47] text-[#F4B63F] transition-colors hover:border-[#F4B63F] hover:bg-[#F4B63F] hover:text-[#0A2A31] sm:self-center"
              >
                <span className="material-symbols-outlined text-[22px]">download</span>
              </button>
            </div>
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

      {printBooking && (
        <div className="kk-print-root">
          <TicketArtwork booking={printBooking} />
        </div>
      )}
    </main>
  );
}
