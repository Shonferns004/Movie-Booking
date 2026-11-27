import { useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { assetUrl } from '../services/api.js';

const inr = (minor = 0) =>
  `₹${Number((Number(minor) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const CalendarIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="3" y="4" width="18" height="17" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

const ScreenIcon = () => (
  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="2" y="4" width="20" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </svg>
);

export default function MovieTicketModal({ booking, onClose, onManage }) {
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

  if (!booking) return null;

  const seats = Array.isArray(booking.seats) ? booking.seats : [];
  const startsAt = new Date(booking.starts_at || '');
  const date = Number.isNaN(startsAt.getTime())
    ? 'Date TBA'
    : startsAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const time = Number.isNaN(startsAt.getTime())
    ? '--:--'
    : startsAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  const seatLabels = seats.map((seat) => seat.seat_label || seat.seat_number).filter(Boolean);
  const firstSeat = String(seatLabels[0] || '');
  const row = firstSeat.replace(/[0-9]/g, '') || seats[0]?.row_label || '—';
  const numbers = seatLabels.map((label) => String(label).replace(/[A-Za-z]/g, '')).filter(Boolean);
  const auditorium = booking.auditorium_name || '';
  const screenNumber = auditorium.match(/\d+/)?.[0] || '01';
  const people = seats.length || 1;
  const qr = seats.find((seat) => seat.ticket_reference)?.ticket_reference || booking.booking_reference;
  const poster = booking.thumbnail_url ? assetUrl(booking.thumbnail_url) : '';

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B0C0D]/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Your movie ticket"
      onClick={onClose}
    >
      <div
        className="max-h-[94vh] w-full max-w-[360px] overflow-y-auto rounded-[26px] bg-[#C8433D] text-[#F8EDE7] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#B73530] px-5 py-3 text-center text-[11px] font-semibold tracking-wide">
          Ticket for {people} {people === 1 ? 'person' : 'persons'}
        </div>

        <div className="p-5 space-y-4">
          <div className="overflow-hidden rounded-2xl bg-[#8F2925]">
            {poster ? (
              <img src={poster} alt={`Poster for ${booking.title}`} className="aspect-[4/5] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/5] items-end p-5">
                <span className="font-editorial text-2xl font-semibold">{booking.title}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-medium">
            <span className="inline-flex items-center gap-1.5"><CalendarIcon /> {date}</span>
            <span className="inline-flex items-center gap-1.5"><ClockIcon /> {time}</span>
            <span className="inline-flex items-center gap-1.5"><ScreenIcon /> {auditorium || booking.theatre_name || 'Screen 1'}</span>
          </div>

          <div className="grid grid-cols-3 gap-3 border-t border-white/25 pt-3 text-center">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] opacity-70">Salon</p>
              <p className="font-mono text-lg font-bold">{String(screenNumber).padStart(2, '0')}</p>
            </div>
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] opacity-70">Row</p>
              <p className="font-mono text-lg font-bold">{row}</p>
            </div>
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] opacity-70">Seat</p>
              <p className="font-mono text-lg font-bold">{numbers.join(', ') || '—'}</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-3 text-[#1E2227]">
            <div className="flex items-center gap-3">
              <div
                className="h-11 flex-1"
                aria-hidden="true"
                style={{
                  background:
                    'repeating-linear-gradient(90deg, #1E2227 0 2px, transparent 2px 4px, #1E2227 4px 5px, transparent 5px 8px, #1E2227 8px 11px, transparent 11px 13px)',
                }}
              />
              <QRCodeSVG value={qr} size={54} level="M" bgColor="#ffffff" fgColor="#1E2227" />
            </div>
            <p className="mt-1.5 truncate text-center font-mono text-[9px] tracking-[0.08em] text-[#1E2227]/60">
              {booking.booking_reference}
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 text-[10px]">
            <button
              type="button"
              onClick={onManage}
              className="rounded-lg border border-white/30 px-3 py-2 font-semibold transition-colors hover:bg-white/10"
            >
              Cancellations &amp; refunds
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-[#F8EDE7] px-4 py-2 font-semibold text-[#8F2925]"
            >
              Close
            </button>
          </div>
          <p className="text-center text-[9px] opacity-70">Show this pass at the door · {inr(booking.paid_minor || booking.total_minor || 0)}</p>
        </div>
      </div>
    </div>
  );
}
