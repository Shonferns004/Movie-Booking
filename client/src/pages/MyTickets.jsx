import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api, { assetUrl } from '../services/api.js';

const FALLBACK_POSTER =
  'https://lh3.googleusercontent.com/aida-public/AB6AXuBOo5aPBJ7vdVsyiAG9pfkMVnbOJYOVjsyddb_wdpsXPO4tgUUifaP9nMyjEo-fKxK_ZjauieUWHBTRdqvu8Q4CcOErASg1hSKV9obttLqrrs6jTlTsxDnxRJLtWEC4hmHH1qRKkwdlvckJI1x8oqYkdtQp6GDkqg9I2cHnbuZMEXP4XfOWNlSml_xs9RBxGEFaj-pYqP9suJE5VFC4RFuakypp44Chxara4FwGIgRyLVZSH5AUU610lQ';

const STATUS_STYLES = {
  confirmed: 'bg-primary-container text-on-primary',
  pending: 'bg-tertiary-container text-on-tertiary-container',
  cancelled: 'bg-error-container text-on-error-container',
  expired: 'bg-surface-container-highest text-on-surface-variant',
};

const TICKET_STATUS_STYLES = {
  issued: 'text-tertiary',
  checked_in: 'text-emerald-400',
  cancelled: 'text-error',
  used: 'text-on-surface-variant',
};

function formatMoney(minor, currency = 'INR') {
  const symbol = currency === 'INR' ? '\u20B9' : `${currency} `;
  return `${symbol}${(Number(minor || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatShowTime(value) {
  if (!value) return 'TBA';
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

function MetaCell({ icon, label, value, tone = 'primary' }) {
  const toneClass =
    tone === 'tertiary' ? 'text-tertiary' : tone === 'secondary' ? 'text-secondary' : 'text-primary';
  return (
    <div className="flex flex-col items-center text-center p-2 rounded bg-surface-container-low">
      <span className={`material-symbols-outlined ${toneClass} text-lg mb-1`}>{icon}</span>
      <span className="font-label-sm text-label-sm text-on-surface font-semibold truncate w-full">{value}</span>
      <span className="font-body-sm text-[10px] text-on-surface-variant">{label}</span>
    </div>
  );
}

function TicketCard({ booking }) {
  const show = formatShowTime(booking.starts_at);
  const seats = Array.isArray(booking.seats) ? booking.seats : [];
  const status = booking.status || 'pending';
  const cancelled = status === 'cancelled';

  return (
    <article
      className={`relative rounded-xl overflow-hidden shadow-xl bg-surface-container-low flex flex-col md:flex-row ${
        cancelled ? 'opacity-75' : ''
      }`}
    >
      {/* Poster / Stub Panel */}
      <div className="relative md:w-60 shrink-0 h-44 md:h-auto overflow-hidden bg-surface-container-lowest">
        <img
          alt={`Poster artwork for ${booking.title}`}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            if (e.currentTarget.src !== FALLBACK_POSTER) e.currentTarget.src = FALLBACK_POSTER;
          }}
          src={assetUrl(booking.thumbnail_url) || FALLBACK_POSTER}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-surface-container-lowest/30 to-transparent md:bg-gradient-to-r md:from-transparent md:via-transparent md:to-surface-container-low" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-container-lowest/95 to-transparent md:hidden" />

        {/* Status badge */}
        <span
          className={`absolute top-3 left-3 px-2.5 py-1 rounded font-label-sm text-label-sm tracking-wider ${
            STATUS_STYLES[status] || 'bg-surface-container-highest text-on-surface-variant'
          }`}
        >
          {statusLabel(status)}
        </span>

        {/* Showtime chip */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 md:right-auto">
          <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-dim/85 text-on-surface font-label-sm text-label-sm backdrop-blur-md">
            <span className="material-symbols-outlined text-sm text-tertiary">schedule</span>
            {show.date} &bull; {show.time}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 p-space-lg flex flex-col gap-space-md">
        <div className="flex items-start justify-between gap-space-md">
          <div className="flex flex-col gap-space-xs min-w-0">
            <h2 className="font-headline-md text-headline-md text-on-surface leading-tight tracking-tight truncate">
              {booking.title}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant truncate">
              {booking.theatre_name} &bull; {booking.auditorium_name}
              {booking.language ? ` \u2022 ${booking.language}` : ''}
              {booking.certification ? ` \u2022 ${booking.certification}` : ''}
            </p>
          </div>
          <span className="shrink-0 text-label-sm font-label-sm text-on-surface-variant px-2 py-1 rounded bg-surface-container">
            {booking.booking_reference}
          </span>
        </div>

        {/* Meta grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <MetaCell icon="schedule" label="Showtime" value={show.time} tone="tertiary" />
          <MetaCell icon="event_seat" label="Seats" value={seats.length ? seats.map((s) => s.seat_label).join(', ') : 'None'} />
          <MetaCell icon="confirmation_number" label="Passes" value={seats.filter((s) => s.ticket_reference).length} tone="secondary" />
          <MetaCell icon="payments" label="Total" value={formatMoney(booking.total_minor, booking.currency)} tone="tertiary" />
        </div>

        {/* Seats & Gate Passes */}
        {seats.length > 0 && (
          <div className="flex flex-col gap-space-sm">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-base">qr_code_scanner</span>
              <span className="font-label-md text-label-md text-on-surface uppercase tracking-wider">Seats &amp; Gate Passes</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {seats.map((seat) => (
                <div key={seat.seat_label} className="flex items-center gap-3 p-3 rounded-lg bg-surface-container">
                  {seat.ticket_reference && (
                    <div className="shrink-0 rounded bg-white p-1.5">
                      <QRCodeSVG value={seat.ticket_reference} size={56} />
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-headline-sm text-headline-sm text-on-surface">{seat.seat_label}</span>
                    <span className="font-body-sm text-[11px] text-on-surface-variant truncate">
                      {seat.category_name || 'Standard'} &bull; {formatMoney(seat.price_minor, booking.currency)}
                    </span>
                    {seat.ticket_status && (
                      <span className={`font-label-sm text-label-sm ${TICKET_STATUS_STYLES[seat.ticket_status] || 'text-on-surface-variant'}`}>
                        {statusLabel(seat.ticket_status)}
                        {seat.checked_in_at ? ' \u2022 ' + new Date(seat.checked_in_at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }) : ''}
                      </span>
                    )}
                    {seat.ticket_reference && (
                      <span className="font-label-sm text-label-sm text-on-surface-variant/70 truncate">{seat.ticket_reference}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
          <div className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
            <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
            Instant QR entry at the gate
          </div>
          <div className="flex items-center gap-space-sm">
            <Link
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-container hover:bg-surface-bright text-on-surface font-label-md text-label-md transition-all shadow-sm"
              to={`/booking/${booking.booking_reference}`}
            >
              <span className="material-symbols-outlined text-base">confirmation_number</span>
              Open Gate Pass
            </Link>
            <Link
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary text-surface-container-lowest font-label-md text-label-md font-semibold tracking-wide shadow-lg hover:shadow-primary-container/30 hover:scale-[1.008] active:scale-[0.98] transition-all group"
              to={`/booking/${booking.booking_reference}`}
            >
              <span>View Tickets</span>
              <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-1">arrow_forward</span>
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function MyTickets() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  // Captured once so "upcoming vs past" never flips mid-render.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    let stop = false;
    api
      .get('/bookings/me/tickets')
      .then((r) => {
        if (stop) return;
        setBookings(Array.isArray(r.data) ? r.data : []);
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
  }, []);

  const stats = useMemo(() => {
    const active = bookings.filter((b) => b.status !== 'cancelled');
    const upcoming = active.filter((b) => new Date(b.starts_at).getTime() >= now);
    const seats = bookings.reduce(
      (sum, b) => sum + (Array.isArray(b.seats) ? b.seats.length : 0),
      0
    );
    const spend = active.reduce((sum, b) => sum + Number(b.total_minor || 0), 0);
    return { total: bookings.length, upcoming: upcoming.length, seats, spend };
  }, [bookings, now]);

  const filtered = useMemo(() => {
    if (filter === 'upcoming') {
      return bookings.filter(
        (b) => b.status !== 'cancelled' && new Date(b.starts_at).getTime() >= now
      );
    }
    if (filter === 'past') {
      return bookings.filter(
        (b) => b.status !== 'cancelled' && new Date(b.starts_at).getTime() < now
      );
    }
    if (filter === 'cancelled') {
      return bookings.filter((b) => b.status === 'cancelled');
    }
    return bookings;
  }, [bookings, filter, now]);

  const filters = [
    { key: 'all', label: 'All Passes' },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'past', label: 'Past' },
    { key: 'cancelled', label: 'Cancelled' },
  ];

  return (
    <main className="min-h-screen w-full flex flex-col bg-background">
      {/* Ambient backing glow (mirrors the auth screen) */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[340px] bg-primary-container/10 blur-[130px] rounded-full" />
      </div>

      <div className="relative z-10 flex-1 w-full max-w-6xl mx-auto px-margin-mobile md:px-margin-tablet lg:px-margin py-space-lg md:py-space-xl">
        {/* Page Header */}
        <header className="flex flex-col gap-space-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-space-sm">
              <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary shadow-sm">
                <span className="material-symbols-outlined text-2xl">confirmation_number</span>
              </div>
              <div>
                <span className="font-headline-sm text-headline-sm text-on-surface block tracking-tight">MY TICKETS</span>
                <span className="font-label-sm text-label-sm text-primary uppercase tracking-widest block">Samudai Member Wallet</span>
              </div>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Live QR Entry Ready
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-space-xs">
            <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight">
              Your cinema passes
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant">
              Every booking, reserved seat and gate QR code for Konkani Samudai screens.
            </p>
          </div>
        </header>

        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-sm mt-space-lg">
          <div className="rounded-xl bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Total bookings</span>
            <span className="font-display-mobile text-display-mobile text-on-surface leading-none">{stats.total}</span>
          </div>
          <div className="rounded-xl bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Upcoming shows</span>
            <span className="font-display-mobile text-display-mobile text-primary leading-none">{stats.upcoming}</span>
          </div>
          <div className="rounded-xl bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Seats reserved</span>
            <span className="font-display-mobile text-display-mobile text-tertiary leading-none">{stats.seats}</span>
          </div>
          <div className="rounded-xl bg-surface-container-low p-space-md shadow-md flex flex-col gap-space-xs">
            <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">Total spend</span>
            <span className="font-display-mobile text-display-mobile text-secondary leading-none">{formatMoney(stats.spend)}</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 rounded-lg bg-surface-container-low p-1 gap-1 mt-space-lg">
          {filters.map((f) => (
            <button
              className={`w-full py-2.5 rounded text-center font-label-md text-label-md transition-all duration-200 flex items-center justify-center gap-2 ${
                filter === f.key
                  ? 'bg-primary-container text-on-primary font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
              }`}
              key={f.key}
              onClick={() => setFilter(f.key)}
              type="button"
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="mt-space-md flex items-start gap-2 rounded-lg bg-error-container/30 border border-error/40 px-3 py-2 text-error font-body-sm text-body-sm">
            <span className="material-symbols-outlined text-base">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Ticket list */}
        <div className="flex flex-col gap-space-md mt-space-md">
          {loading && (
            <div className="rounded-xl bg-surface-container-low p-space-xl flex items-center justify-center gap-2 text-on-surface-variant font-label-md text-label-md">
              <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
              Loading your passes...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div className="rounded-xl bg-surface-container-low p-space-xl flex flex-col items-center gap-space-md text-center shadow-md">
              <div className="w-14 h-14 rounded-full bg-surface-container flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-3xl">movie_filter</span>
              </div>
              <div className="flex flex-col gap-space-xs">
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  {bookings.length ? 'Nothing in this filter' : 'No passes yet'}
                </h2>
                <p className="font-body-md text-body-md text-on-surface-variant max-w-md">
                  {bookings.length
                    ? 'Try another filter to see the rest of your Konkani Samudai bookings.'
                    : 'Book a show and your digital pass with instant gate QR codes will appear right here.'}
                </p>
              </div>
              <Link
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-gradient-to-r from-primary-container to-inverse-primary text-surface-container-lowest font-label-md text-label-md font-semibold tracking-wide shadow-lg hover:shadow-primary-container/30 transition-all group"
                to="/"
              >
                <span>Browse Movies</span>
                <span className="material-symbols-outlined text-base transition-transform group-hover:translate-x-1">arrow_forward</span>
              </Link>
            </div>
          )}

          {filtered.map((b) => (
            <TicketCard booking={b} key={b.id} />
          ))}
        </div>

        {/* Trust badges footer */}
        <div className="mt-space-lg rounded-xl bg-surface-container-low/70 px-space-md py-space-sm flex flex-wrap items-center justify-around gap-2 text-on-surface-variant font-label-sm text-label-sm">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-primary">verified_user</span>
            <span>Instant QR Entry</span>
          </div>
          <span className="text-outline-variant">&bull;</span>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-tertiary">timer</span>
            <span>8-Min Seat Hold</span>
          </div>
          <span className="text-outline-variant">&bull;</span>
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm text-secondary">cancel_schedule_send</span>
            <span>Zero Cancel Fees</span>
          </div>
        </div>

        {/* Micro metadata bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between text-on-surface-variant/70 font-body-sm text-body-sm px-space-sm pt-space-md gap-space-xs">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-primary/70" />
            <span>Konkani Samudai Theaters &bull; Kodial Central Auditorium, Mangaluru</span>
          </div>
          <div className="flex items-center gap-space-md font-label-sm text-label-sm">
            <a className="hover:text-primary transition-colors" href="#">Seat Allocation Policy</a>
            <span>/</span>
            <a className="hover:text-primary transition-colors" href="#">Patron Privileges</a>
            <span>/</span>
            <a className="hover:text-primary transition-colors" href="#">Box Office Support</a>
          </div>
        </div>
      </div>
    </main>
  );
}
