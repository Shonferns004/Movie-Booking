import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import TicketArtwork from './TicketArtwork.jsx';

export default function BookingTicket({ reference, initialBooking, onDone }) {
  const [booking, setBooking] = useState(initialBooking || null);
  const [loading, setLoading] = useState(!initialBooking);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const tries = useRef(0);

  useEffect(() => {
    if (!reference) return undefined;

    let cancelled = false;
    let retryTimer;
    tries.current = 0;
    setLoading(true);

    const load = async () => {
      const guestToken = sessionStorage.getItem(`bookingToken:${reference}`);
      try {
        const response = await api.get(`/bookings/${reference}`, {
          params: guestToken ? { token: guestToken } : undefined,
          timeout: 20000,
        });
        if (cancelled) return;
        const nextBooking = response.data;
        setBooking(nextBooking);
        setError('');
        const ready = Array.isArray(nextBooking?.tickets) && nextBooking.tickets.length > 0;
        if (!ready && tries.current < 8) {
          tries.current += 1;
          retryTimer = window.setTimeout(load, 3000);
          return;
        }
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err?.response?.data?.error || 'We could not load your ticket.');
        setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, [reference, reloadKey]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-8 space-y-5" role="status" aria-label="Loading your ticket">
        <span className="sr-only">Preparing your ticket</span>

        <div className="flex animate-pulse flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="h-3 w-20 rounded bg-[#2A3037]" />
            <div className="h-8 w-52 max-w-full rounded bg-[#2A3037]" />
            <div className="h-3 w-72 max-w-full rounded bg-[#252A30]" />
          </div>
          <div className="h-10 w-28 shrink-0 rounded-xl bg-[#2A3037]" />
        </div>

        <div className="animate-pulse rounded-[22px] bg-[#252A30] p-5">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="h-40 w-28 shrink-0 rounded-xl bg-[#2A3037]" />
            <div className="min-w-0 flex-1 space-y-3">
              <div className="h-3 w-32 rounded bg-[#1E2227]" />
              <div className="h-7 w-3/4 max-w-full rounded bg-[#2A3037]" />
              <div className="h-3 w-1/2 max-w-full rounded bg-[#1E2227]" />
              <div className="h-3 w-2/3 max-w-full rounded bg-[#1E2227]" />
              <div className="flex flex-wrap gap-2 pt-2">
                <div className="h-10 w-24 rounded bg-[#1E2227]" />
                <div className="h-10 w-24 rounded bg-[#1E2227]" />
              </div>
            </div>
            <div className="h-24 w-24 shrink-0 rounded-lg bg-[#2A3037]" />
          </div>
          <div className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-[#1E2227] p-3">
            <div className="h-3 w-44 max-w-[50%] rounded bg-[#2A3037]" />
            <div className="h-8 w-24 rounded bg-[#2A3037]" />
          </div>
        </div>

        <div className="flex animate-pulse flex-wrap items-center justify-between gap-3 pt-2">
          <div className="h-10 w-36 rounded-xl bg-[#2A3037]" />
          <div className="h-3 w-28 rounded bg-[#252A30]" />
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="mx-auto max-w-4xl px-4 sm:px-6 py-16 text-center">
        <h2 className="font-editorial text-3xl font-semibold text-[#F2F0EB]">Ticket not ready yet</h2>
        <p className="mt-3 text-sm text-[#B5AFA6]">{error || 'The payment is still being confirmed.'}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="inline-flex rounded-xl border border-[#B5AFA6]/30 px-5 py-3 text-xs font-semibold text-[#F2F0EB] transition-colors hover:border-[#C8FF1F] hover:text-[#C8FF1F]"
          >
            Try again
          </button>
          <Link to="/my-tickets" className="inline-flex rounded-xl bg-[#C8FF1F] px-5 py-3 text-xs font-semibold text-[#1E2227]">
            Open my tickets
          </Link>
        </div>
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
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onDone} className="rounded-xl border border-[#B5AFA6]/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#B5AFA6] hover:border-[#C8FF1F] hover:text-[#C8FF1F]">
            Back to the house
          </button>
          <Link to="/my-tickets" className="rounded-xl border border-[#B5AFA6]/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#B5AFA6] hover:border-[#C8FF1F] hover:text-[#C8FF1F]">
            Cancellations &amp; refunds
          </Link>
        </div>
        <p className="font-mono text-[10px] text-[#B5AFA6]">Booking {booking.booking_reference}</p>
      </div>
    </div>
  );
}
