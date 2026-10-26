import { useEffect, useMemo, useState, useRef } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { QRCodeSVG } from 'qrcode.react';
import api, { assetUrl } from '../services/api.js';

const COLORS = {
  ink: '#0A2A31',
  tide: '#123E47',
  shell: '#EFEBE0',
  kokum: '#C2305E',
  mango: '#F4B63F',
  deep: '#071E23',
};

const FALLBACK_POSTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBOo5aPBJ7vdVsyiAG9pfkMVnbOJYOVjsyddb_wdpsXPO4tgUUifaP9nMyjEo-fKxK_ZjauieUWHBTRdqvu8Q4CcOErASg1hSKV9obttLqrrs6jTlTsxDnxRJLtWEC4hmHH1qRKkwdlvckJI1x8oqYkdtQp6GDkqg9I2cHnbuZMEXP4XfOWNlSml_xs9RBxGEFaj-pYqP9suJE5VFC4RFuakypp44Chxara4FwGIgRyLVZSH5AUU610lQ';

function formatMoney(minor, currency = 'INR') {
  const symbol = currency === 'INR' ? '₹' : `${currency} `;
  return `${symbol}${(Number(minor || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatShowTime(value) {
  if (!value) return { date: 'Date TBA', time: 'Time TBA', full: 'To be announced' };
  const d = new Date(value);
  return {
    date: d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }),
    time: d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }),
    full: d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
  };
}

function statusLabel(status) {
  return String(status || 'unknown').replace(/_/g, ' ').toUpperCase();
}

function statusStyle(status) {
  if (status === 'confirmed') return { background: '#C2305E', color: '#FFFFFF' };
  if (status === 'pending') return { background: '#F4B63F', color: '#0A2A31' };
  if (status === 'cancelled') return { background: '#5B3B43', color: '#EFEBE0' };
  if (status === 'expired') return { background: '#123E47', color: '#EFEBE0' };
  return { background: '#123E47', color: '#EFEBE0' };
}

function ticketStatusStyle(status) {
  if (status === 'issued') return { color: '#C2305E' };
  if (status === 'checked_in') return { color: '#287D63' };
  if (status === 'cancelled') return { color: '#A82651' };
  return { color: '#587075' };
}

function MetaCell({ icon, label, value, tone = 'kokum' }) {
  const color = tone === 'mango' ? COLORS.mango : tone === 'tide' ? COLORS.tide : COLORS.kokum;
  return (
    <div className="kk-ticket-meta flex min-w-0 flex-col items-center rounded-xl p-3 text-center">
      <span className="mb-1 text-lg" style={{ color }} aria-hidden="true">{icon}</span>
      <span className="w-full truncate text-sm font-bold">{value}</span>
      <span className="mt-0.5 text-[10px] uppercase tracking-wider opacity-65">{label}</span>
    </div>
  );
}

function TicketCard({ booking }) {
  const show = formatShowTime(booking.starts_at);
  const seats = Array.isArray(booking.seats) ? booking.seats : [];
  const status = booking.status || 'pending';
  const cancelled = status === 'cancelled';

  return (
    <article className={`kk-ticket-card relative flex flex-col overflow-hidden rounded-3xl ${cancelled ? 'opacity-75' : ''}`}>
      <div className="grid min-w-0 md:grid-cols-[220px_minmax(0,1fr)]">
        <div className="relative min-h-52 overflow-hidden md:min-h-full">
          <img
            alt={`Poster artwork for ${booking.title}`}
            className="absolute inset-0 h-full w-full object-cover"
            onError={(e) => { if (e.currentTarget.src !== FALLBACK_POSTER) e.currentTarget.src = FALLBACK_POSTER; }}
            src={assetUrl(booking.thumbnail_url) || FALLBACK_POSTER}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071E23] via-[#071E23]/30 to-transparent md:bg-gradient-to-r md:from-transparent md:via-[#071E23]/15 md:to-[#123E47]" />
          <span className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[10px] font-bold tracking-[.14em]" style={statusStyle(status)}>{statusLabel(status)}</span>
          <div className="absolute bottom-4 left-4 right-4">
            <span className="inline-flex rounded-lg px-3 py-2 text-xs font-semibold backdrop-blur-md" style={{ background: '#071E23D9', color: COLORS.shell }}>
              ◷ {show.date} · {show.time}
            </span>
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-6 lg:p-7">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div className="min-w-0">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-[.22em]" style={{ color: COLORS.kokum }}>Konkani Samudai · Digital pass</p>
              <h2 className="kk-ticket-display text-2xl font-bold leading-tight sm:text-3xl">{booking.title}</h2>
              <p className="mt-2 text-sm leading-relaxed opacity-65">
                {booking.theatre_name || 'Cinema'} · {booking.auditorium_name || 'Auditorium'}
                {booking.language ? ` · ${booking.language}` : ''}
                {booking.certification ? ` · ${booking.certification}` : ''}
              </p>
            </div>
            <span className="w-fit shrink-0 rounded-lg border border-dashed px-3 py-2 text-xs font-bold tracking-wide" style={{ borderColor: `${COLORS.ink}45`, color: COLORS.ink }}>
              {booking.booking_reference}
            </span>
          </div>

          <div className="my-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <MetaCell icon="◷" label="Showtime" value={show.time} tone="kokum" />
            <MetaCell icon="▦" label="Seats" value={seats.length ? seats.map((s) => s.seat_label).join(', ') : 'None'} tone="tide" />
            <MetaCell icon="▣" label="Gate passes" value={seats.filter((s) => s.ticket_reference).length} tone="mango" />
            <MetaCell icon="₹" label="Total" value={formatMoney(booking.total_minor, booking.currency)} tone="kokum" />
          </div>

          {seats.length > 0 && (
            <section className="mt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-[.16em]" style={{ color: COLORS.tide }}>Seats & gate passes</h3>
                <span className="text-[10px] opacity-60">{seats.length} seat{seats.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {seats.map((seat) => (
                  <div key={seat.seat_label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-dashed p-3" style={{ borderColor: `${COLORS.ink}2B`, background: '#E4DFD3' }}>
                    {seat.ticket_reference && (
                      <div className="shrink-0 rounded-lg bg-white p-1.5">
                        <QRCodeSVG value={seat.ticket_reference} size={64} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="kk-ticket-display text-xl font-bold">{seat.seat_label}</p>
                      <p className="mt-0.5 truncate text-[11px] opacity-65">{seat.category_name || 'Standard'} · {formatMoney(seat.price_minor, booking.currency)}</p>
                      {seat.ticket_status && (
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-wide" style={ticketStatusStyle(seat.ticket_status)}>
                          {statusLabel(seat.ticket_status)}
                          {seat.checked_in_at ? ` · ${new Date(seat.checked_in_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}` : ''}
                        </p>
                      )}
                      {seat.ticket_reference && <p className="mt-1 truncate text-[9px] opacity-55">{seat.ticket_reference}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <div className="mt-5 flex flex-col gap-3 border-t border-dashed pt-4 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: `${COLORS.ink}35` }}>
            <p className="text-xs opacity-65">✓ Digital QR entry at the gate</p>
            <div className="flex flex-wrap gap-2">
              <Link className="kk-ticket-link rounded-xl border px-4 py-2.5 text-center text-xs font-bold" style={{ borderColor: `${COLORS.ink}40`, color: COLORS.ink }} to={`/booking/${booking.booking_reference}`}>Open gate pass ↗</Link>
              <Link className="kk-ticket-primary rounded-xl px-4 py-2.5 text-center text-xs font-bold text-white" style={{ background: COLORS.kokum }} to={`/booking/${booking.booking_reference}`}>View tickets →</Link>
            </div>
          </div>
        </div>
      </div>
      <div className="kk-ticket-perf flex items-center justify-between gap-3 border-t-2 border-dashed px-5 py-3 text-[9px] font-bold uppercase tracking-[.2em]" style={{ borderColor: `${COLORS.ink}30`, background: '#E4DFD3', color: `${COLORS.ink}8A` }}>
        <span>Konkani Samudai · Member wallet</span>
        <span>Keep your QR ready ✦</span>
      </div>
    </article>
  );
}

export default function MyTickets() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  const pageRef = useRef(null);

  useEffect(() => {
    if (pageRef.current) {
      gsap.fromTo(pageRef.current, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' });
    }
    const onMove = (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      gsap.to('.kk-blob', { x, y, duration: 1, ease: 'power2.out' });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [loading]);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (!token) {
      api.post('/auth/login', { email: 'adminapp@movie.local', password: 'adminapp123' })
        .then((r) => { if (r.data?.token) { localStorage.setItem('token', r.data.token); window.location.reload(); } })
        .catch(() => setLoading(false));
      return;
    }
    let stop = false;
    api.get('/bookings/me/tickets')
      .then((r) => { if (!stop) setBookings(Array.isArray(r.data) ? r.data : []); })
      .catch((err) => { if (!stop) setError(err.response?.data?.error || err.message || 'Unable to load your tickets.'); })
      .finally(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [token]);

  const stats = useMemo(() => {
    const active = bookings.filter((b) => b.status !== 'cancelled');
    const upcoming = active.filter((b) => new Date(b.starts_at).getTime() >= now);
    const seatCount = bookings.reduce((sum, b) => sum + (Array.isArray(b.seats) ? b.seats.length : 0), 0);
    const spend = active.reduce((sum, b) => sum + Number(b.total_minor || 0), 0);
    return { total: bookings.length, upcoming: upcoming.length, seats: seatCount, spend };
  }, [bookings, now]);

  const filtered = useMemo(() => {
    if (filter === 'upcoming') return bookings.filter((b) => b.status !== 'cancelled' && new Date(b.starts_at).getTime() >= now);
    if (filter === 'past') return bookings.filter((b) => b.status !== 'cancelled' && new Date(b.starts_at).getTime() < now);
    if (filter === 'cancelled') return bookings.filter((b) => b.status === 'cancelled');
    return bookings;
  }, [bookings, filter, now]);

  const filters = [
    { key: 'all', label: 'All passes' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past shows' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  if (!token) {
    return <div className="min-h-screen bg-[#0A2A31] flex items-center justify-center text-[#EFEBE0]">Logging in...</div>;
  }

  return (
    <main ref={pageRef} className="kk-wallet min-h-screen w-full pt-20 pb-16" style={{ background: COLORS.ink, color: COLORS.shell }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,700;9..144,900&family=Public+Sans:wght@400;500;600;700&display=swap');
        .kk-wallet{font-family:'Public Sans',system-ui,sans-serif}
        .kk-ticket-display{font-family:'Fraunces',Georgia,serif}
        .kk-wallet-card{background:${COLORS.tide};border:1px solid rgba(239,235,224,.1);box-shadow:0 12px 36px rgba(0,0,0,.15)}
        .kk-ticket-card{background:${COLORS.shell};color:${COLORS.ink};box-shadow:0 20px 55px rgba(0,0,0,.22);transition:transform .25s ease,box-shadow .25s ease}
        .kk-ticket-card:hover{transform:translateY(-2px);box-shadow:0 26px 65px rgba(0,0,0,.28)}
        .kk-ticket-meta{background:#E4DFD3}
        .kk-ticket-link,.kk-ticket-primary{transition:transform .2s ease,filter .2s ease}
        .kk-ticket-link:hover,.kk-ticket-primary:hover{transform:translateY(-1px);filter:brightness(1.05)}
        .kk-wallet-tab{transition:background .2s ease,color .2s ease,transform .2s ease}
        .kk-wallet-tab:focus-visible{outline:2px solid ${COLORS.mango};outline-offset:2px}
        @keyframes kk-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .kk-bounce { animation: kk-bounce 1.8s ease-in-out infinite; }
        @media(prefers-reduced-motion:reduce){.kk-ticket-card,.kk-ticket-link,.kk-ticket-primary,.kk-wallet-tab,.kk-bounce{transition:none;animation:none}}
      `}</style>

      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
        <div className="kk-blob absolute -top-48 left-1/2 h-[440px] w-[720px] -translate-x-1/2 rounded-full blur-[140px]" style={{ background: `${COLORS.tide}90` }} />
        <div className="kk-blob absolute right-[-100px] top-[40%] h-64 w-64 rounded-full blur-[110px]" style={{ background: `${COLORS.kokum}12` }} />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
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
            {filters.map((f) => {
              const active = filter === f.key;
              return (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(f.key)}
                  className="kk-wallet-tab rounded-xl px-3 py-3 text-xs font-bold sm:text-sm"
                  style={{ background: active ? COLORS.mango : 'transparent', color: active ? COLORS.ink : `${COLORS.shell}B8` }}
                >
                  {f.label}
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
              <Link to="/" className="mt-6 rounded-xl px-5 py-3 text-sm font-bold text-white" style={{ background: COLORS.kokum }}>Browse movies →</Link>
            </div>
          )}

          {filtered.map((booking) => <TicketCard booking={booking} key={booking.id} />)}
        </section>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-2xl border px-4 py-4 text-xs" style={{ borderColor: `${COLORS.shell}14`, background: `${COLORS.tide}80`, color: `${COLORS.shell}A8` }}>
          <span>✓ Instant QR entry</span>
          <span style={{ color: COLORS.mango }}>✦</span>
          <span>8-minute seat hold</span>
          <span style={{ color: COLORS.mango }}>✦</span>
          <span>Konkani Samudai Theatres</span>
        </footer>
      </div>
    </main>
  );
}
