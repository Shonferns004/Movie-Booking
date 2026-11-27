import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, Navigate } from 'react-router-dom';
import { gsap } from 'gsap';
import api, { assetUrl } from '../services/api.js';
import { useSileoNotice } from '../hooks/useSileoNotice.js';
import { useScrollReveal, useHoverLift, prefersReducedMotion } from '../hooks/useMotion.js';
import TicketArtwork from '../components/TicketArtwork.jsx';
import MovieTicketModal from '../components/MovieTicketModal.jsx';
import EventTicketArtwork from '../components/EventTicketArtwork.jsx';
import StyledQr from '../components/StyledQr.jsx';
import UiIcon from '../components/UiIcon.jsx';

const COLORS = {
  ink: '#1E2227',
  tide: '#262C33',
  shell: '#F2F0EC',
  kokum: '#C8FF1F',
  mango: '#C8FF1F',
  deep: '#171B1F',
};

const REFUND_STATUS = {
  pending: { label: 'Refund queued', tone: 'text-[#8A6D1A]' },
  processing: { label: 'Refund processing', tone: 'text-[#8A6D1A]' },
  completed: { label: 'Refunded', tone: 'text-[#2E6B2E]' },
  failed: { label: 'Refund failed', tone: 'text-[#A23B32]' },
};

const inr = (minor = 0) =>
  `₹${Number((Number(minor) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function TicketPassModal({ booking, onClose, onDownload, onUpdated }) {
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

  const bookingStatus = String(booking.status || '').toLowerCase();
  const cancellation = booking.cancellation || null;
  const refunds = Array.isArray(booking.refunds) ? booking.refunds : [];
  const refundTotal = refunds.reduce((sum, row) => sum + (Number(row.amount_minor) || 0), 0);
  const startsAt = Number.isNaN(date.getTime()) ? null : date;
  const isUpcoming = Boolean(startsAt && startsAt.getTime() > Date.now());
  const hasScanned = seats.some((seat) => seat.checked_in_at || seat.ticket_status === 'checked_in');
  const requestOpen = !cancellation || cancellation.status === 'rejected';
  const canRequest = bookingStatus === 'confirmed' && isUpcoming && !hasScanned && requestOpen;

  const [cancelMode, setCancelMode] = useState(false);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [requestSent, setRequestSent] = useState(false);
  const pendingApproval = cancellation?.status === 'pending' || requestSent;

  const openCancel = async () => {
    setCancelMode(true);
    setCancelError('');
    setQuote(null);
    setQuoteLoading(true);
    try {
      const response = await api.get(`/bookings/${encodeURIComponent(booking.booking_reference)}/cancel-quote`);
      setQuote(response.data);
    } catch (err) {
      setCancelError(err?.response?.data?.error || err?.message || 'Could not load the refund estimate.');
    } finally {
      setQuoteLoading(false);
    }
  };

  const submitCancel = async () => {
    setSubmitting(true);
    setCancelError('');
    try {
      await api.post(`/bookings/${encodeURIComponent(booking.booking_reference)}/cancel`, {
        reason: reason.trim() || undefined,
      });
      setRequestSent(true);
      onUpdated?.();
    } catch (err) {
      setCancelError(err?.response?.data?.error || err?.message || 'Could not send the cancellation request.');
    } finally {
      setSubmitting(false);
    }
  };

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
              <h2 className="mt-1 truncate font-['Playfair Display',Georgia,serif] text-[25px] font-bold leading-tight sm:text-[30px]">
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
              <UiIcon name="close" className="text-[18px]" />
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
                <UiIcon name="download" className="text-[16px]" />
                Download ticket
              </button>
            </div>
          </div>

          {(bookingStatus === 'cancelled' || cancellation || canRequest) && (
            <section className="mt-5 rounded-2xl border border-[#1E2227]/15 bg-white/40 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#1E2227]/70">
                  Cancellation
                </p>
                <Link
                  to="/refunds"
                  className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#1E2227]/70 underline underline-offset-2"
                >
                  Policy
                </Link>
              </div>

              {bookingStatus === 'cancelled' ? (
                <div className="mt-3">
                  <p className="text-[12px] font-semibold text-[#1E2227]">
                    This booking is cancelled.
                  </p>
                  {booking.cancellation_reason && (
                    <p className="mt-1 text-[11px] leading-5 text-[#1E2227]/65">
                      Reason: {booking.cancellation_reason}
                    </p>
                  )}
                  {refunds.length === 0 ? (
                    <p className="mt-2 text-[11px] leading-5 text-[#1E2227]/65">
                      No payment was captured for this booking, so no refund is due.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {refunds.map((refund) => {
                        const state = REFUND_STATUS[refund.status] || { label: refund.status, tone: 'text-[#1E2227]/70' };
                        return (
                          <div key={refund.id} className="rounded-xl bg-[#1E2227]/[0.06] px-3 py-2.5">
                            <div className="flex items-center justify-between gap-3">
                              <span className={`text-[10px] font-bold uppercase tracking-[0.12em] ${state.tone}`}>
                                {state.label}
                              </span>
                              <span className="text-[13px] font-bold tabular-nums text-[#1E2227]">
                                {inr(refund.amount_minor)}
                              </span>
                            </div>
                            {refund.utr && (
                              <p className="mt-1 text-[10px] text-[#1E2227]/60">
                                UTR <span className="font-mono">{refund.utr}</span>
                              </p>
                            )}
                          </div>
                        );
                      })}
                      <p className="text-[10px] leading-5 text-[#1E2227]/55">
                        Approved refunds are paid to the UPI account used for payment.
                      </p>
                    </div>
                  )}
                </div>
              ) : pendingApproval ? (
                <div className="mt-3">
                  <p className="text-[12px] font-semibold text-[#1E2227]">
                    Cancellation requested · waiting for the venue
                  </p>
                  <p className="mt-1 text-[11px] leading-5 text-[#1E2227]/65">
                    Your tickets stay valid until the request is reviewed. If approved,{' '}
                    <strong>{inr(cancellation?.refund_minor ?? quote?.quote?.refundMinor ?? 0)}</strong>{' '}
                    will be refunded to your UPI account.
                  </p>
                  {cancellation?.reason && (
                    <p className="mt-1 text-[10px] text-[#1E2227]/55">Reason: {cancellation.reason}</p>
                  )}
                </div>
              ) : cancelMode ? (
                <div className="mt-3">
                  {quoteLoading ? (
                    <div className="flex items-center gap-2 py-4 text-[11px] text-[#1E2227]/65">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-dashed border-[#1E2227]/50 border-t-transparent" />
                      Checking the refund window…
                    </div>
                  ) : quote?.quote?.allowed ? (
                    <div>
                      <div className="flex items-end justify-between gap-3 rounded-xl bg-[#C8FF1F] px-3 py-3 text-[#1E2227]">
                        <div>
                          <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#1E2227]/70">
                            Refund estimate
                          </p>
                          <p className="mt-0.5 text-[22px] font-bold leading-none tabular-nums">
                            {inr(quote.quote.refundMinor)}
                          </p>
                        </div>
                        <p className="text-right text-[10px] font-semibold leading-4">
                          {quote.quote.percent}% of {inr(quote.quote.paidMinor)}
                        </p>
                      </div>
                      <p className="mt-2 text-[10px] leading-5 text-[#1E2227]/65">
                        Request before{' '}
                        {quote.quote.deadline
                          ? new Date(quote.quote.deadline).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: true,
                          })
                          : 'the show starts'}
                        . The venue reviews every request before paying it out.
                      </p>
                      <label className="mt-3 block">
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#1E2227]/70">
                          Reason (optional)
                        </span>
                        <textarea
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          maxLength={500}
                          rows={2}
                          placeholder="Plans changed, booked the wrong show…"
                          className="mt-1 w-full resize-none rounded-xl border border-[#1E2227]/15 bg-white px-3 py-2 text-[12px] text-[#1E2227] outline-none placeholder:text-[#1E2227]/35 focus:border-[#1E2227]/40"
                        />
                      </label>
                      {cancelError && (
                        <p className="mt-2 rounded-lg bg-[#A23B32]/10 px-3 py-2 text-[11px] text-[#A23B32]">
                          {cancelError}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={submitCancel}
                          className="flex-1 rounded-full bg-[#1E2227] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F2F0EC] disabled:opacity-60"
                        >
                          {submitting ? 'Sending…' : 'Request cancellation'}
                        </button>
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => setCancelMode(false)}
                          className="rounded-full border border-[#1E2227]/20 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1E2227]/70"
                        >
                          Keep tickets
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-[11px] leading-5 text-[#1E2227]/70">
                        {quote?.quote?.reason || cancelError || 'This booking is not eligible for self-service cancellation.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                          to="/refunds"
                          className="rounded-full border border-[#1E2227]/20 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1E2227]/70"
                        >
                          Read policy
                        </Link>
                        <button
                          type="button"
                          onClick={() => setCancelMode(false)}
                          className="rounded-full bg-[#1E2227] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F2F0EC]"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3">
                  <p className="text-[11px] leading-5 text-[#1E2227]/65">
                    Changed your plans? Check the refund estimate before sending a request. Your tickets stay valid until the venue approves it.
                  </p>
                  <button
                    type="button"
                    onClick={openCancel}
                    className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#1E2227]/25 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1E2227] transition-colors hover:bg-[#1E2227]/5"
                  >
                    <UiIcon name="event_busy" className="text-[14px]" />
                    Request cancellation
                  </button>
                </div>
              )}
            </section>
          )}
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

  useSileoNotice(error, 'error', { title: 'Tickets' });
  const [filter, setFilter] = useState('all');
  const [now] = useState(() => Date.now());
  const [printBooking, setPrintBooking] = useState(null);
  const [previewBooking, setPreviewBooking] = useState(null);
  const [ticketPreview, setTicketPreview] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const pageRef = useRef(null);
  const token = localStorage.getItem('token');

  useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    if (pageRef.current) {
      gsap.fromTo(
        pageRef.current,
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', clearProps: 'transform' },
      );
    }
    const setters = gsap.utils.toArray('.kk-blob').map((blob) => ({
      x: gsap.quickTo(blob, 'x', { duration: 0.9, ease: 'power2.out' }),
      y: gsap.quickTo(blob, 'y', { duration: 0.9, ease: 'power2.out' }),
    }));
    const onMove = (event) => {
      const x = (event.clientX / window.innerWidth - 0.5) * 20;
      const y = (event.clientY / window.innerHeight - 0.5) * 20;
      setters.forEach((setter) => {
        setter.x(x);
        setter.y(y);
      });
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, [loading]);

  const revealKey = `${loading}-${bookings.length}-${eventPasses.length}`;
  useScrollReveal(pageRef, { refreshKey: revealKey });
  useHoverLift(pageRef, '[data-hover-lift]', revealKey);

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
          const visible = rows.filter((booking) => booking.status !== 'pending');
          setBookings(visible);
          // Keep an open pass in sync after a cancellation request changes its state.
          setPreviewBooking((current) => (
            current ? visible.find((booking) => booking.id === current.id) || current : current
          ));
        } else {
          const err = bookingsResult.reason;
          setError(err?.response?.data?.error || err?.message || 'Unable to load your tickets.');
        }

        if (passesResult.status === 'fulfilled' && Array.isArray(passesResult.value.data)) {
          setEventPasses(
            (Array.isArray(passesResult.value.data) ? passesResult.value.data : []).filter(
              (pass) => pass.status !== 'cancelled',
            ),
          );
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
  }, [token, refreshKey]);

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

  const account = (() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  })();
  const email = account?.email || '';
  const movieRows = bookings
    .filter((booking) => booking.status !== 'cancelled')
    .sort((a, b) => new Date(a.starts_at || 0) - new Date(b.starts_at || 0));
  const formatFor = (name = '') => {
    if (/dolby/i.test(name)) return 'Dolby Atmos';
    if (/2k|laser/i.test(name)) return '2K Laser';
    return name.split('·').pop()?.trim() || 'Cinema';
  };
  const whenFor = (value) => {
    const date = new Date(value || '');
    if (Number.isNaN(date.getTime())) return 'Date TBA';
    return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} · ${date
      .toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
      .toLowerCase()}`;
  };
  const qrFor = (booking) =>
    booking?.seats?.find((seat) => seat?.ticket_reference)?.ticket_reference || booking?.booking_reference;

  return (
    <main ref={pageRef} className="min-h-screen w-full pb-16" style={{ background: COLORS.ink, color: COLORS.shell }}>
      <style>{`
        .kk-wallet-card{background:${COLORS.tide}}
        .kk-ticket-display{font-family:'Playfair Display',Georgia,serif}
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
      `}</style>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-9">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#C8FF1F]">
              Konkani Samudai · Box Office
            </p>
            <h1 className="mt-2 font-editorial text-4xl sm:text-5xl font-semibold leading-none text-[#F2F0EB]">
              My tickets
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#B5AFA6]">
              Present your digital pass at Samudai Cineplex or Samudai Grounds, Margao.
              Cancellations and refunds release seats immediately.
            </p>
          </div>
          <Link
            to="/movies"
            className="shrink-0 self-start rounded-xl bg-[#C8FF1F] px-5 py-3 text-sm font-semibold text-[#1E2227] transition-colors hover:bg-[#B5AFA6]"
          >
            Films and showtimes
          </Link>
        </div>
      </div>

      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 pt-8 space-y-5">
        {error && (
          <div className="rounded-xl bg-[#1E2227] px-4 py-3 text-sm text-[#F0B0A6]">{error}</div>
        )}

        {loading && (
          <div className="space-y-5">
            <span className="sr-only" role="status">Loading your tickets</span>
            {[0, 1].map((item) => (
              <div key={item} className="overflow-hidden rounded-[20px] bg-[#252A30] animate-pulse">
                <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6">
                  <div className="h-24 w-24 shrink-0 rounded-xl bg-[#16191D]" />
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="h-3 w-44 rounded bg-[#2A3037]" />
                    <div className="h-7 w-64 max-w-full rounded bg-[#2A3037]" />
                    <div className="h-3 w-80 max-w-full rounded bg-[#1E2227]" />
                    <div className="h-3 w-56 max-w-full rounded bg-[#1E2227]" />
                  </div>
                  <div className="flex items-center justify-between gap-5 sm:flex-col sm:items-end">
                    <div className="space-y-2 text-right">
                      <div className="h-3 w-16 rounded bg-[#1E2227]" />
                      <div className="h-7 w-24 rounded bg-[#2A3037]" />
                      <div className="h-3 w-14 rounded bg-[#1E2227]" />
                    </div>
                    <div className="h-[92px] w-[92px] rounded-lg bg-[#2A3037]" />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 bg-[#1E2227]/40 px-5 py-3">
                  <div className="h-3 w-44 rounded bg-[#2A3037]" />
                  <div className="h-3 w-36 rounded bg-[#2A3037]" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && movieRows.length === 0 && eventPasses.length === 0 && (
          <div className="kk-wallet-card flex flex-col items-center rounded-[20px] px-6 py-14 text-center">
            <h2 className="kk-ticket-display text-3xl text-[#F2F0EB]">No passes issued yet</h2>
            <p className="mt-3 max-w-md text-sm leading-6 text-[#B5AFA6]">
              Book seats at Samudai Cineplex or pick up festival tickets to see your barcode passes here.
            </p>
            <Link to="/movies" className="mt-6 rounded-xl bg-[#C8FF1F] px-5 py-3 text-xs font-semibold text-[#1E2227]">
              Browse Movies
            </Link>
          </div>
        )}

        {!loading && movieRows.map((booking) => {
          const seats = Array.isArray(booking.seats) ? booking.seats : [];
          const when = whenFor(booking.starts_at);
          const cancelled = booking.status === 'cancelled';
          const total = booking.paid_minor || booking.total_minor || 0;
          return (
            <article
              key={booking.id}
              role="button"
              tabIndex={0}
              onClick={() => setTicketPreview(booking)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setTicketPreview(booking);
                }
              }}
              className="group cursor-pointer overflow-hidden rounded-[20px] bg-[#252A30] transition-colors duration-200 hover:bg-[#2A3037] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#C8FF1F]"
              data-reveal
              data-hover-lift
            >
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#16191D]">
                  {booking.thumbnail_url ? (
                    <img
                      src={assetUrl(booking.thumbnail_url)}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2A3037] to-[#16191D]">
                      <span className="font-editorial text-2xl text-[#C8FF1F]">KS</span>
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-semibold text-[#C8FF1F]">
                    <span>{booking.booking_reference}</span>
                    <span className="text-[#B5AFA6]/40">·</span>
                    <span className="text-[#B5AFA6]">{formatFor(booking.auditorium_name)}</span>
                    {cancelled && (
                      <span className="rounded-full bg-[#F08A80]/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#F0B0A6]">
                        Cancelled
                      </span>
                    )}
                  </div>
                  <h2 className="mt-1.5 font-editorial text-2xl font-semibold leading-tight text-[#F2F0EB]">
                    {booking.title}
                  </h2>
                  <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#B5AFA6]">
                    <span className="inline-flex items-center gap-2">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <rect x="3" y="4" width="18" height="17" rx="2" />
                        <path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                      {when}
                    </span>
                    <span className="inline-flex items-center gap-2">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                        <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                        <circle cx="12" cy="10" r="2.5" />
                      </svg>
                      {[booking.theatre_name, booking.auditorium_name].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[#B5AFA6]">
                    Seats:{' '}
                    <span className="font-semibold text-[#F2F0EB]">
                      {seats.map((seat) => seat.seat_label).filter(Boolean).join(', ') || '—'}
                    </span>
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 sm:justify-end">
                  <div className="text-left sm:text-right">
                    <p className="text-[11px] text-[#B5AFA6]">Total Paid</p>
                    <p className="font-mono text-2xl font-bold leading-tight text-[#C8FF1F] tabular-nums">
                      {inr(total)}
                    </p>
                    <p className="text-[10px] text-[#B5AFA6]">YouPI · Paid</p>
                  </div>
                  <div className="rounded-lg bg-white p-1.5">
                    <StyledQr
                      value={qrFor(booking) || booking.booking_reference}
                      size={112}
                      background="#ffffff"
                      accent="#1E2227"
                      logo={false}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1E2227]/40 px-5 py-3 text-[11px] text-[#B5AFA6]">
                <span>Issued to {booking.contact_email || email || 'member'}</span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setTicketPreview(booking);
                  }}
                  className="inline-flex items-center gap-2 font-medium transition-colors hover:text-[#F2F0EB]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5" />
                  </svg>
                  Cancellations and refunds
                </button>
              </div>
            </article>
          );
        })}

        {!loading && eventPasses.map((pass) => (
          <article
            key={pass.id || pass.orderId}
            className="overflow-hidden rounded-[20px] bg-[#252A30]"
            data-reveal
            data-hover-lift
          >
            <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-[#16191D]">
                {eventBackground ? (
                  <img src={eventBackground} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#2A3037] to-[#16191D]">
                    <span className="font-editorial text-2xl text-[#C8FF1F]">KS</span>
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs font-semibold text-[#C8FF1F]">
                  <span>{pass.orderId}</span>
                  <span className="text-[#B5AFA6]/40">·</span>
                  <span className="text-[#B5AFA6]">Event pass</span>
                </div>
                <h2 className="mt-1.5 font-editorial text-2xl font-semibold text-[#F2F0EB]">
                  {pass.eventTitle}
                </h2>
                <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-[#B5AFA6]">
                  <span>{[pass.eventDate, pass.eventTime].filter(Boolean).join(' · ') || 'Date TBA'}</span>
                  {pass.venue && <span>{pass.venue}</span>}
                </div>
                <p className="mt-2 text-xs text-[#B5AFA6]">
                  Passes: <span className="font-semibold text-[#F2F0EB]">{pass.quantity} × {pass.tierName}</span>
                </p>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <div className="text-left sm:text-right">
                  <p className="text-[11px] text-[#B5AFA6]">Total Paid</p>
                  <p className="font-mono text-2xl font-bold leading-tight text-[#C8FF1F] tabular-nums">
                    {inr(pass.baseAmountMinor ?? pass.amountMinor ?? 0)}
                  </p>
                  <p className="text-[10px] text-[#B5AFA6]">YouPI · Paid</p>
                </div>
                <Link to={`/event-ticket/${pass.orderId}`} className="shrink-0 rounded-lg bg-white p-1.5">
                  <StyledQr
                    value={pass.orderId}
                    size={112}
                    background="#ffffff"
                    accent="#1E2227"
                    logo={false}
                  />
                </Link>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1E2227]/40 px-5 py-3 text-[11px] text-[#B5AFA6]">
              <span>Issued to {pass.buyerName || email || 'member'}</span>
              <Link to={`/event-ticket/${pass.orderId}`} className="font-medium transition-colors hover:text-[#F2F0EB]">
                Open pass &amp; download
              </Link>
            </div>
          </article>
        ))}
      </div>

      {ticketPreview && (
        <MovieTicketModal
          booking={ticketPreview}
          onClose={() => setTicketPreview(null)}
          onManage={() => {
            setPreviewBooking(ticketPreview);
            setTicketPreview(null);
          }}
          onDownload={(booking) => {
            setTicketPreview(null);
            setPrintBooking(booking);
          }}
        />
      )}

      {previewBooking && (
        <TicketPassModal
          booking={previewBooking}
          onClose={() => setPreviewBooking(null)}
          onUpdated={() => setRefreshKey((key) => key + 1)}
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
