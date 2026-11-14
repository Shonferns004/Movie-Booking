import { useMemo } from 'react';

/**
 * Movie ticket in the black + red stub style: a wide cinema panel with the
 * show details and a perforated red stub carrying gate / row / seat, a barcode
 * and the ticket number. Used on My Tickets and in the print-to-PDF view.
 */

function makeBars(value) {
  const source = String(value || 'KONKANI').replace(/[^A-Z0-9-]/gi, '') || 'KONKANI';
  let seed = 13;
  return Array.from({ length: 46 }, (_, index) => {
    const code = source.charCodeAt(index % source.length);
    seed = (seed * 37 + code * 17 + index * 13) % 1009;
    return 1 + (seed % 3);
  });
}

function seatParts(seats) {
  const labels = seats.map((seat) => String(seat?.seat_label || '')).filter(Boolean);
  const rows = [...new Set(labels.map((label) => label.replace(/[0-9]+/g, '').trim()).filter(Boolean))];
  const numbers = labels.map((label) => label.replace(/[^0-9]/g, '')).filter(Boolean);
  return { labels, rows, numbers };
}

export default function TicketArtwork({ booking }) {
  const date = new Date(booking?.starts_at || '');
  const validDate = !Number.isNaN(date.getTime());

  const weekday = validDate ? date.toLocaleDateString('en-IN', { weekday: 'long' }).toUpperCase() : 'SHOWTIME';
  const dayMonth = validDate
    ? date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }).toUpperCase()
    : 'DATE TBA';
  const time = validDate
    ? date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toUpperCase()
    : 'TIME TBA';

  const seats = Array.isArray(booking?.seats) ? booking.seats : [];
  const { labels, rows, numbers } = seatParts(seats);
  const gate = String(booking?.auditorium_name || '').match(/\d+/)?.[0] || '01';
  const ticketNumber = String(booking?.booking_reference || '').replace(/^BK-/, '');
  const venue = [booking?.theatre_name, booking?.auditorium_name].filter(Boolean).join(' · ') || 'Konkani Samudai';
  const status = String(booking?.status || '').toLowerCase();
  const cancelled = status === 'cancelled';

  const bars = useMemo(() => makeBars(ticketNumber || booking?.id), [ticketNumber, booking?.id]);

  return (
    <article
      className="kk-ticket-art relative grid overflow-hidden rounded-[22px] bg-[#0A0A0C] text-white shadow-[0_30px_70px_-35px_rgba(0,0,0,0.9)] sm:grid-cols-[minmax(0,1fr)_300px]"
      style={{ '--kk-ticket-bg': '#0A2A31' }}
    >
      {/* Left: cinema panel */}
      <div className="relative overflow-hidden px-5 py-6 sm:px-8 sm:py-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <svg
            className="absolute -bottom-14 -left-12 h-52 w-52 text-white/[0.06]"
            viewBox="0 0 100 100"
            fill="currentColor"
          >
            <circle cx="50" cy="50" r="46" />
            <circle cx="50" cy="50" r="9" fill="#0A0A0C" />
            <circle cx="50" cy="20" r="8" fill="#0A0A0C" />
            <circle cx="50" cy="80" r="8" fill="#0A0A0C" />
            <circle cx="20" cy="50" r="8" fill="#0A0A0C" />
            <circle cx="80" cy="50" r="8" fill="#0A0A0C" />
            <circle cx="29" cy="29" r="8" fill="#0A0A0C" />
            <circle cx="71" cy="29" r="8" fill="#0A0A0C" />
            <circle cx="29" cy="71" r="8" fill="#0A0A0C" />
            <circle cx="71" cy="71" r="8" fill="#0A0A0C" />
          </svg>
          <svg
            className="absolute -right-4 bottom-0 h-28 w-52 text-white/[0.07]"
            viewBox="0 0 200 110"
            fill="currentColor"
          >
            <rect x="8" y="44" width="88" height="48" rx="7" />
            <rect x="96" y="60" width="26" height="16" rx="3" />
            <path d="M122 52 L160 32 L160 96 L122 76 Z" />
            <circle cx="40" cy="24" r="18" />
            <circle cx="40" cy="24" r="5" fill="#0A0A0C" />
            <rect x="12" y="26" width="10" height="18" rx="2" />
            <rect x="92" y="86" width="10" height="18" rx="2" />
          </svg>
        </div>

        <div className="relative">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#F4B63F]">
              Konkani Samudai · Movie pass
            </p>
            {cancelled && (
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[8px] font-bold uppercase tracking-[0.14em] text-white/80">
                Cancelled
              </span>
            )}
          </div>

          <h2 className="mt-3 line-clamp-3 font-['Bebas_Neue',Impact,'Arial_Narrow',sans-serif] text-[36px] font-normal uppercase leading-[0.94] tracking-[0.015em] sm:text-[46px]">
            {booking?.title || 'Movie night'}
          </h2>

          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/45">{weekday}</p>
              <p className="mt-0.5 text-[15px] font-semibold leading-none">{dayMonth}</p>
            </div>
            <span className="h-8 w-[2px] bg-[#C61D23]" aria-hidden="true" />
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/45">Start at</p>
              <p className="mt-0.5 text-[15px] font-semibold leading-none">{time}</p>
            </div>
            <div>
              <p className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/45">Screen</p>
              <p className="mt-0.5 max-w-[150px] truncate text-[15px] font-semibold leading-none">
                {booking?.auditorium_name || 'Main'}
              </p>
            </div>
          </div>

          <div className="mt-5 h-px bg-white/20" />

          <p className="mt-3 text-[9px] font-bold uppercase tracking-[0.18em] text-white/70">{venue}</p>
          {booking?.theatre_address && (
            <p className="mt-1 line-clamp-1 text-[10px] text-white/40">{booking.theatre_address}</p>
          )}
          <p className="mt-2 line-clamp-1 text-[10px] text-white/55">
            {labels.length ? labels.join(' · ') : 'Seats assigned at the counter'}
          </p>
        </div>
      </div>

      {/* Perforation + red stub */}
      <div className="relative border-t border-dashed border-white/25 bg-[#C61D23] px-5 py-5 sm:border-l sm:border-t-0 sm:px-6">
        <span
          aria-hidden="true"
          className="absolute -top-2.5 right-6 hidden h-5 w-5 rounded-full sm:block"
          style={{ background: 'var(--kk-ticket-bg)' }}
        />
        <span
          aria-hidden="true"
          className="absolute -bottom-2.5 right-6 hidden h-5 w-5 rounded-full sm:block"
          style={{ background: 'var(--kk-ticket-bg)' }}
        />
        <span
          aria-hidden="true"
          className="absolute -left-2.5 top-4 h-5 w-5 rounded-full sm:hidden"
          style={{ background: 'var(--kk-ticket-bg)' }}
        />
        <span
          aria-hidden="true"
          className="absolute -right-2.5 top-4 h-5 w-5 rounded-full sm:hidden"
          style={{ background: 'var(--kk-ticket-bg)' }}
        />

        <div className="grid grid-cols-3 text-center">
          <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/70">Gate</span>
          <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/70">Row</span>
          <span className="text-[8px] font-bold uppercase tracking-[0.22em] text-white/70">Seat</span>
        </div>
        <div className="mt-1 grid grid-cols-3 border-y border-white/35 py-2 text-center">
          <span className="text-[18px] font-semibold leading-none">{gate}</span>
          <span className="text-[18px] font-semibold leading-none">{rows.join(', ') || '—'}</span>
          <span className="text-[15px] font-semibold leading-none">{numbers.join(', ') || '—'}</span>
        </div>

        <div className="mt-4 flex h-14 items-stretch gap-[2px] overflow-hidden" aria-hidden="true">
          {bars.map((width, index) => (
            <span key={index} className="h-full bg-white/95" style={{ width: `${width}px` }} />
          ))}
        </div>
        <p className="mt-1.5 text-center font-mono text-[7px] tracking-[0.18em] text-white/70">
          {`${ticketNumber.slice(0, 5)} ${ticketNumber.slice(5, 10)} ${ticketNumber.slice(10)}`.trim()}
        </p>

        <p className="mt-3 flex items-center justify-between gap-2 text-[8px] font-bold uppercase tracking-[0.16em] text-white/75">
          <span>Ticket number</span>
          <span className="font-mono text-[9px] tracking-[0.06em]">{ticketNumber || '—'}</span>
        </p>
      </div>
    </article>
  );
}
