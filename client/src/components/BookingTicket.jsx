import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import TicketArtwork from './TicketArtwork.jsx';

export default function BookingTicket({ reference, initialBooking, onDone }) {
  const [booking, setBooking] = useState(initialBooking || null);
  const [loading, setLoading] = useState(!initialBooking);
  const [error, setError] = useState('');
  const fetched = useRef(false);

  useEffect(() => {
    if (!reference || fetched.current || (booking && booking.tickets)) return undefined;
    fetched.current = true;
    let alive = true;
    const guestToken = sessionStorage.getItem(`bookingToken:${reference}`);
    setLoading(true);
    api
      .get(`/bookings/${reference}`, { params: guestToken ? { token: guestToken } : undefined })
      .then((response) => {
        if (alive) {
          setBooking(response.data);
          setError('');
        }
      })
      .catch((err) => {
        if (alive) setError(err?.response?.data?.error || 'We could not load your ticket.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [reference, booking]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 text-center">
        <span className="mx-auto block h-6 w-6 animate-spin rounded-full border-2 border-dashed border-[#C8FF1F] border-t-transparent" />
        <p className="mt-4 text-sm text-[#B5AFA6]">Preparing your ticket…</p>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 text-center">
        <h2 className="font-editorial text-3xl font-semibold text-[#F2F0EB]">Ticket not ready yet</h2>
        <p className="mt-3 text-sm text-[#B5AFA6]">{error || 'The payment is still being confirmed.'}</p>
        <Link to="/my-tickets" className="mt-6 inline-flex rounded-xl bg-[#C8FF1F] px-5 py-3 text-xs font-semibold text-[#1E2227]">
          Open my tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8FF1F]">Ticket</p>
          <h2 className="mt-1 font-editorial text-3xl font-semibold text-[#F2F0EB]">You’re in.</h2>
          <p className="mt-1 text-sm text-[#B5AFA6]">Show this pass at the door. It is also saved in My tickets.</p>
        </div>
        <Link to="/my-tickets" className="shrink-0 rounded-xl bg-[#C8FF1F] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1E2227]">
          My tickets
        </Link>
      </div>
      <TicketArtwork booking={booking} />
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <button type="button" onClick={onDone} className="rounded-xl border border-[#B5AFA6]/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#B5AFA6] hover:border-[#C8FF1F] hover:text-[#C8FF1F]">
          Back to the house
        </button>
        <p className="font-mono text-[10px] text-[#B5AFA6]">Booking {booking.booking_reference}</p>
      </div>
    </div>
  );
}
