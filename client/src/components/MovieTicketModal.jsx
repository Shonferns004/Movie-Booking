import { useEffect, useRef } from 'react';
import { assetUrl } from '../services/api.js';
import { useModalMotion } from '../hooks/useMotion.js';
import TicketBarcode from './TicketBarcode.jsx';

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

export default function MovieTicketModal({ booking, onClose, onManage, onDownload }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  useModalMotion(panelRef, backdropRef);

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
      ref={backdropRef}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#0B0C0D]/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Your movie ticket"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className="relative max-h-[94vh] w-full max-w-[360px] overflow-y-auto overflow-x-hidden rounded-[24px] bg-[#252A30] text-[#F2F0EB] shadow-[0_40px_100px_-40px_rgba(0,0,0,0.9)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bg-[#C8FF1F]/10 px-4 py-2.5">
          <p className="text-center text-[11px] font-semibold tracking-wide text-[#C8FF1F]">
            Ticket for {people} {people === 1 ? 'person' : 'persons'}
          </p>
        </div>

        <div className="px-4 pt-4">
          <div className="mx-auto h-[200px] w-[200px] overflow-hidden rounded-2xl bg-[#16191D]">
            {poster ? (
              <img src={poster} alt={`Poster for ${booking.title}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-end p-4">
                <span className="font-editorial text-xl font-semibold">{booking.title}</span>
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] font-medium text-[#B5AFA6]">
            <span className="inline-flex items-center gap-1.5"><CalendarIcon /> {date}</span>
            <span className="inline-flex items-center gap-1.5"><ClockIcon /> {time}</span>
            <span className="inline-flex min-w-0 items-center gap-1.5"><ScreenIcon /> <span className="truncate">{auditorium || booking.theatre_name || 'Screen 1'}</span></span>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#B5AFA6]/15 pt-2.5 text-center">
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#B5AFA6]">Salon</p>
              <p className="font-mono text-lg font-bold">{String(screenNumber).padStart(2, '0')}</p>
            </div>
            <div>
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#B5AFA6]">Row</p>
              <p className="font-mono text-lg font-bold">{row}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#B5AFA6]">Seat</p>
              <p className="truncate font-mono text-lg font-bold">{numbers.join(', ') || '—'}</p>
            </div>
          </div>
        </div>

        <div className="relative mt-3">
          <span className="pointer-events-none absolute left-0 top-0 z-10 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#0B0C0D]" />
          <span className="pointer-events-none absolute right-0 top-0 z-10 h-5 w-5 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#0B0C0D]" />
          <div className="border-t border-dashed border-[#B5AFA6]/30 bg-white px-4 pb-3 pt-2.5 text-[#1E2227]">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#1E2227]/50">Booking</p>
              <p className="text-[8px] text-[#1E2227]/50">Show this at the door</p>
            </div>
            <p className="mt-1 break-all font-mono text-[10px] tracking-[0.08em]">
              {booking.booking_reference}
            </p>
            <div className="mt-2 h-9 w-full">
              <TicketBarcode value={qr} height={32} barColor="#1E2227" />
            </div>
          </div>
        </div>

        <div className="px-4 pt-3">
          <button
            type="button"
            onClick={() => onDownload?.(booking)}
            className="w-full rounded-xl bg-[#C8FF1F] py-2.5 text-xs font-semibold text-[#1E2227] transition-colors hover:bg-[#B5AFA6]"
          >
            Download ticket
          </button>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 text-[10px]">
          <button
            type="button"
            onClick={onManage}
            className="font-medium text-[#B5AFA6] underline decoration-[#B5AFA6]/40 underline-offset-4 transition-colors hover:text-[#C8FF1F]"
          >
            Cancellations &amp; refunds
          </button>
          <span className="text-[#B5AFA6]">{inr(booking.paid_minor || booking.total_minor || 0)}</span>
        </div>
      </div>
    </div>
  );
}
