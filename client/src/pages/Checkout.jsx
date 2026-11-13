import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api.js';

const C = {
  ink: '#0A2A31',
  tide: '#123E47',
  shell: '#EFEBE0',
  kokum: '#C2305E',
  mango: '#F4B63F',
  green: '#1E5B3C',
  greenSoft: '#E7F3EA',
};

let youpiScriptPromise = null;

function loadYoupiScript(scriptUrl, merchantKey, { apiUrl, portalUrl } = {}) {
  if (window.Youpi) return Promise.resolve(window.Youpi);
  if (youpiScriptPromise) return youpiScriptPromise;

  youpiScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    if (merchantKey) script.setAttribute('data-youpi-key', merchantKey);
    if (apiUrl) script.setAttribute('data-api-url', apiUrl);
    if (portalUrl) script.setAttribute('data-portal-url', portalUrl);
    script.setAttribute('data-currency', 'INR');
    script.onload = () => {
      if (window.Youpi) resolve(window.Youpi);
      else reject(new Error('Youpi SDK unavailable'));
    };
    script.onerror = () => reject(new Error('Failed to load the secure payment window'));
    document.head.appendChild(script);
  }).catch((error) => {
    // Allow a later attempt if the network or SDK script fails to load.
    youpiScriptPromise = null;
    throw error;
  });

  return youpiScriptPromise;
}

const rupees = (minor = 0) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(minor || 0) / 100);

const wholeRupees = (minor = 0) => `₹${Math.round(Number(minor || 0) / 100).toLocaleString('en-IN')}`;

function formatShowDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatShowTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatExpiry(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Shortly' : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

const STYLES = `
.kk-checkout { font-family: 'Public Sans', system-ui, sans-serif; }
.kk-display { font-family: 'Fraunces', Georgia, serif; }
.kk-pay { transition: background-color .2s ease, transform .2s ease, opacity .2s ease; }
.kk-pay:not(:disabled):hover { background-color: #a82651; transform: translateY(-1px); }
.kk-row { transition: background-color .16s ease; }
.kk-row:hover { background-color: rgba(10,42,49,.04); }
.kk-toast { animation: kk-checkout-in .22s ease both; }
@keyframes kk-checkout-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
@media (prefers-reduced-motion: reduce) {
  .kk-pay { transition: none !important; }
  .kk-toast { animation: none !important; }
}
`;

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [account] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  });

  const [hold] = useState(() => {
    if (location.state) return location.state;
    try {
      return JSON.parse(localStorage.getItem('currentHold') || 'null');
    } catch {
      return null;
    }
  });

  // The seat page hands over everything the summary needs, so the card is instant.
  const [holdContext] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('currentHoldContext') || 'null');
    } catch {
      return null;
    }
  });
  const contextMatches = Boolean(holdContext && hold?.holdId && holdContext.holdId === hold.holdId);

  const [name, setName] = useState(account?.displayName || account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [mobile, setMobile] = useState(account?.mobile || '');
  const [editingContact, setEditingContact] = useState(false);
  const [offersOpen, setOffersOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [booking, setBooking] = useState(null);
  const [order, setOrder] = useState(null);
  const [movie, setMovie] = useState(() => (contextMatches && holdContext?.title
    ? { title: holdContext.title, language: holdContext.language, certification: holdContext.certification }
    : null));
  const [showMeta, setShowMeta] = useState(() => (contextMatches && holdContext?.startsAt
    ? { theatre_name: holdContext.theatre, auditorium_name: holdContext.auditorium, starts_at: holdContext.startsAt }
    : null));
  const [heldSeats, setHeldSeats] = useState(() => (
    contextMatches && Array.isArray(holdContext?.seats) ? holdContext.seats : []
  ));
  const pollRef = useRef(null);

  useEffect(() => {
    if (!hold) navigate('/', { replace: true });
  }, [hold, navigate]);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(''), 3200);
    return () => clearTimeout(timer);
  }, [notice]);

  // Resolve the held seats, movie and theatre for the summary card.
  useEffect(() => {
    if (!hold?.showId) return undefined;
    if (contextMatches && holdContext?.seats?.length) return undefined;
    let active = true;

    (async () => {
      try {
        const seatsResponse = await api.get(`/shows/${hold.showId}/seats`);
        const show = seatsResponse.data.show || {};
        const seats = Array.isArray(seatsResponse.data.seats) ? seatsResponse.data.seats : [];
        const mine = seats.filter((seat) => seat.hold_id === hold.holdId);
        if (active) {
          setHeldSeats(mine);
          setShowMeta((current) => current || null);
        }

        const movieId = show.movie_id;
        if (!movieId) return;
        const [movieResponse, showsResponse] = await Promise.all([
          api.get(`/movies/${movieId}`),
          api.get('/shows', { params: { movieId } }),
        ]);
        if (!active) return;
        setMovie(movieResponse.data);
        const match = (showsResponse.data || []).find((item) => item.id === hold.showId);
        if (match) setShowMeta(match);
      } catch {
        // The summary still renders from the hold when seat metadata is unavailable.
      }
    })();

    return () => { active = false; };
  }, [hold?.showId, hold?.holdId, contextMatches, holdContext]);

  const seatGroups = useMemo(() => {
    const map = new Map();
    for (const seat of heldSeats) {
      const category = (seat.category_name || 'Seat').toUpperCase();
      if (!map.has(category)) map.set(category, []);
      map.get(category).push(`${seat.row_label}${seat.seat_number}`);
    }
    return [...map.entries()];
  }, [heldSeats]);

  if (!hold) {
    return (
      <main className="kk-checkout min-h-screen bg-[#0A2A31] px-5 py-16 text-[#EFEBE0]">
        <style>{STYLES}</style>
        <div className="mx-auto max-w-lg rounded-3xl border border-[#EFEBE0]/10 bg-[#123E47] p-8 text-center shadow-2xl">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C2305E]/15 text-[#C2305E]">
            <span className="material-symbols-outlined text-3xl">confirmation_number</span>
          </span>
          <h1 className="kk-display text-2xl font-semibold">No active seat hold</h1>
          <p className="mt-2 text-sm leading-6 text-[#EFEBE0]/65">Choose your seats first, then return here to complete your booking.</p>
          <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-full bg-[#C2305E] px-6 py-3 text-sm font-semibold text-[#EFEBE0] transition hover:bg-[#d34270]">
            Browse movies
          </Link>
        </div>
      </main>
    );
  }

  const totalMinor = Number(hold.totalMinor || 0);
  const seatCount = Number(hold.seatCount || heldSeats.length || 0);
  const currency = hold.currency || 'INR';
  const title = movie?.title || showMeta?.movie_title || 'Your booking';
  const cinema = showMeta?.theatre_name || 'Konkani Samudai';
  const screen = showMeta?.auditorium_name || '';
  const startsAt = showMeta?.starts_at || '';

  function startStatusPolling(activeOrder, activeBooking) {
    if (!activeOrder?.paymentId || pollRef.current) return;
    const paymentId = activeOrder.paymentId;
    const reference = activeBooking.booking_reference;
    let attempts = 0;

    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const response = await api.get(`/payments/youpi/status/${paymentId}`);
        const state = String(response.data?.status || '').toUpperCase();
        if (state === 'SUCCESS') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('Payment received. Confirming your tickets…');
          try {
            await api.post('/payments/youpi/confirm', {
              orderId: activeOrder.orderId,
              utr: null,
              amountPaise: activeOrder.amountMinor,
            });
          } catch {
            // The webhook remains the source of truth.
          }
          localStorage.removeItem('currentHold');
          localStorage.removeItem('currentHoldContext');
          navigate(`/booking/${reference}`);
          return;
        }
        if (state === 'FAILED' || state === 'EXPIRED') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('');
          setError(state === 'EXPIRED' ? 'The payment window expired. Please try again.' : 'The payment did not go through. Please try again.');
        }
      } catch {
        // Keep polling; transient network errors are expected while the UPI app is open.
      }
      if (attempts >= 80) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3500);
  }

  async function openPaymentModal(activeOrder, activeBooking) {
    // If the visitor signed in with WhatsApp OTP, hand the verified customer session to
    // the checkout page so it does not ask for the same number again.
    let checkoutUrl = activeOrder.checkoutUrl;
    try {
      const customerToken = localStorage.getItem('youpiCustomerToken');
      if (checkoutUrl && customerToken) {
        const url = new URL(checkoutUrl);
        url.searchParams.set('customerToken', customerToken);
        checkoutUrl = url.toString();
      }
    } catch {
      // Keep the plain checkout URL if it cannot be parsed.
    }

    const options = {
      key: activeOrder.merchantKey,
      paymentId: activeOrder.paymentId,
      checkoutUrl,
      orderId: activeOrder.orderId,
      amount: activeOrder.amount,
      currency: activeOrder.currency,
      name: 'Konkani Samudai',
      description: `Konkani Samudai booking ${activeBooking.booking_reference}`,
      portalUrl: activeOrder.portalUrl,
      apiUrl: activeOrder.apiUrl,
      theme: { color: C.kokum },
      customer: {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: mobile.trim() || undefined,
      },
      onSuccess: () => {
        localStorage.removeItem('currentHold');
        localStorage.removeItem('currentHoldContext');
        navigate(`/booking/${activeBooking.booking_reference}`);
      },
      onFailed: (result) => {
        setError(result?.error || result?.reason || 'Payment failed. Please try again.');
        setStatus('');
        setLoading(false);
      },
      onCancelled: () => {
        setStatus('');
        setNotice('Payment cancelled. Your seats are still held for a few minutes.');
        setLoading(false);
      },
      onClose: () => setLoading(false),
    };

    const Youpi = await loadYoupiScript(activeOrder.scriptUrl, activeOrder.merchantKey, {
      apiUrl: activeOrder.apiUrl,
      portalUrl: activeOrder.portalUrl,
    });

    if (typeof Youpi?.pay === 'function') {
      await Youpi.pay(options);
    } else if (typeof Youpi?.open === 'function') {
      Youpi.open(options);
    } else {
      throw new Error('Payment SDK did not initialise');
    }
  }

  async function payNow() {
    if (loading) return;
    setLoading(true);
    setError('');
    setNotice('');

    try {
      // Reuse the pending booking/order if the visitor closed the payment window.
      if (booking && order) {
        setStatus('Reopening the secure payment window…');
        await openPaymentModal(order, booking);
        setStatus('Complete your payment in the secure window.');
        startStatusPolling(order, booking);
        setLoading(false);
        return;
      }

      setStatus('Reserving your booking…');
      const bookingResponse = await api.post('/bookings', {
        holdId: hold.holdId,
        contactEmail: email.trim() || undefined,
        contactMobile: mobile.trim() || undefined,
        sessionRef: localStorage.getItem('sessionRef') || undefined,
      });
      const createdBooking = bookingResponse.data;
      setBooking(createdBooking);

      setStatus('Starting secure payment…');
      const orderResponse = await api.post('/payments/youpi/orders', {
        bookingReference: createdBooking.booking_reference,
        customer: {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          mobile: mobile.trim() || undefined,
        },
      });
      const createdOrder = orderResponse.data;
      setOrder(createdOrder);

      setStatus('Opening the secure payment window…');
      await openPaymentModal(createdOrder, createdBooking);
      setStatus('Complete your payment in the secure window.');
      startStatusPolling(createdOrder, createdBooking);
      setLoading(false);
    } catch (checkoutError) {
      setError(
        checkoutError.response?.data?.error
        || checkoutError.message
        || 'Unable to start checkout. Please try again.',
      );
      setStatus('');
      setLoading(false);
    }
  }

  const payLabel = loading ? 'Opening secure payment…' : `Pay ${rupees(totalMinor)}`;

  return (
    <div className="kk-checkout min-h-screen bg-[#0A2A31] pb-32 text-[#EFEBE0]">
      <style>{STYLES}</style>

      {/* Show bar */}
      <div className="sticky top-[72px] z-30 border-b border-[#EFEBE0]/10 bg-[#0A2A31]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back to seats"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#EFEBE0]/70 transition hover:bg-[#EFEBE0]/10 hover:text-[#EFEBE0]"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back_ios_new</span>
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="kk-display truncate text-base font-bold leading-tight sm:text-xl">{title}</h1>
            <p className="truncate text-[10px] text-[#EFEBE0]/55 sm:text-xs">
              {startsAt ? `${formatShowDate(startsAt)} | ${formatShowTime(startsAt)}` : 'Secure checkout'}
              {cinema && <span className="mx-1.5 text-[#EFEBE0]/25">|</span>}
              {cinema}
            </p>
          </div>
          <span
            className="shrink-0 rounded-md border px-3 py-2 text-xs font-semibold"
            style={{ borderColor: `${C.kokum}99`, color: C.kokum }}
          >
            {seatCount} {seatCount === 1 ? 'Ticket' : 'Tickets'}
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        {/* Ticket summary */}
        <section className="overflow-hidden rounded-2xl text-[#0A2A31] shadow-2xl" style={{ background: C.shell }}>
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="kk-display text-xl font-bold sm:text-2xl">{title}</h2>
                <p className="mt-1 text-sm font-semibold">
                  {startsAt ? `${formatShowDate(startsAt)} | ${formatShowTime(startsAt)}` : 'Showtime confirmed'}
                </p>
                <p className="mt-1 text-xs text-[#0A2A31]/55">
                  {[movie?.language, movie?.certification, screen ? `Audi ${screen}` : ''].filter(Boolean).join(' · ') || 'Cinema screening'}
                </p>

                <div className="mt-4 space-y-1 text-sm">
                  {seatGroups.length ? seatGroups.map(([category, labels]) => (
                    <p key={category} className="font-medium">
                      <span className="text-[#0A2A31]/60">{category} - </span>
                      {labels.join(', ')}
                    </p>
                  )) : (
                    <p className="font-medium">Seat{(seatCount === 1 ? '' : 's')} reserved</p>
                  )}
                </div>

                <p className="mt-3 text-xs leading-5 text-[#0A2A31]/60">
                  {cinema}{screen ? ` (${screen})` : ''}
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] text-[#0A2A31]/50">
                  <span className="material-symbols-outlined text-[14px]">schedule</span>
                  Seats held until {formatExpiry(hold.expiresAt)}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="kk-display text-3xl font-bold leading-none">{seatCount}</p>
                <button
                  type="button"
                  onClick={() => setNotice('Your seats are reserved. Change them from the seat map before paying.')}
                  className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold"
                  style={{ color: C.kokum }}
                >
                  <span className="material-symbols-outlined text-[13px]">edit</span>
                  M-Ticket
                </button>
              </div>
            </div>
          </div>

          <div className="px-5 py-4 sm:px-6" style={{ background: C.greenSoft, color: C.green }}>
            <p className="text-xs font-bold">Cancellation Available</p>
            <p className="mt-1 text-[11px] leading-5 text-[#1E5B3C]/85">
              This venue supports booking cancellation. <span className="underline-offset-2">View cancellation policy</span>
            </p>
          </div>
        </section>

        {/* Price breakdown */}
        <section className="rounded-2xl p-5 text-[#0A2A31] shadow-xl sm:p-6" style={{ background: C.shell }}>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#0A2A31]/65">Ticket(s) price</span>
              <span className="font-semibold tabular-nums">{rupees(totalMinor)}</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-[#0A2A31]/65">
                Convenience fees
                <span className="material-symbols-outlined cursor-help text-[14px] text-[#0A2A31]/35" title="No booking fee is added on this deployment.">info</span>
              </span>
              <span className="font-semibold tabular-nums">₹0.00</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#0A2A31]/65">Taxes</span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#0A2A31]/45">Included</span>
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4 border-t border-dashed border-[#0A2A31]/25 pt-4">
            <span className="text-sm font-semibold">Order total</span>
            <span className="kk-display text-2xl font-bold tabular-nums">{rupees(totalMinor)}</span>
          </div>
          <p className="mt-2 text-[10px] text-[#0A2A31]/45">Payable in {currency} · you will be charged {wholeRupees(totalMinor)}</p>
        </section>

        {/* Contact */}
        <section className="rounded-2xl border border-[#EFEBE0]/10 bg-[#123E47] p-5 shadow-lg shadow-black/10 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#EFEBE0]/45">For sending booking details</p>
              <p className="mt-1 text-sm font-semibold text-[#EFEBE0]/90">{editingContact ? 'Add a contact' : 'Booking updates'}</p>
            </div>
            <button
              type="button"
              onClick={() => setEditingContact((open) => !open)}
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold"
              style={{ color: C.kokum }}
            >
              <span className="material-symbols-outlined text-[14px]">edit</span>
              {editingContact ? 'Done' : 'Edit'}
            </button>
          </div>

          {editingContact ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#EFEBE0]/45">Full name (optional)</span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-[#EFEBE0]/[0.12] bg-[#071E23]/70 px-3 py-3 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30 focus:border-[#F4B63F]/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#EFEBE0]/45">Mobile number</span>
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={mobile}
                  onChange={(event) => setMobile(event.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 20))}
                  placeholder="98765 43210"
                  className="w-full rounded-lg border border-[#EFEBE0]/[0.12] bg-[#071E23]/70 px-3 py-3 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30 focus:border-[#F4B63F]/60"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.14em] text-[#EFEBE0]/45">Email address</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-lg border border-[#EFEBE0]/[0.12] bg-[#071E23]/70 px-3 py-3 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30 focus:border-[#F4B63F]/60"
                />
              </label>
            </div>
          ) : (
            <div className="mt-2 space-y-1 text-sm text-[#EFEBE0]/75">
              <p>{mobile.trim() || 'No mobile number added'}</p>
              <p className="text-[#EFEBE0]/55">{email.trim() || 'No email address added'}</p>
              <p className="text-[11px] text-[#EFEBE0]/35">Your ticket and QR pass are sent here.</p>
            </div>
          )}
        </section>

        {/* Offers */}
        <section className="overflow-hidden rounded-2xl border border-[#EFEBE0]/10 bg-[#123E47] shadow-lg shadow-black/10">
          <button
            type="button"
            onClick={() => setOffersOpen((open) => !open)}
            aria-expanded={offersOpen}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left sm:px-6"
          >
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <span className="material-symbols-outlined text-[18px]" style={{ color: C.mango }}>local_activity</span>
              Apply Offers
            </span>
            <span className="material-symbols-outlined text-[#EFEBE0]/45">{offersOpen ? 'expand_less' : 'chevron_right'}</span>
          </button>
          {offersOpen && (
            <div className="border-t border-[#EFEBE0]/10 px-5 py-4 text-xs text-[#EFEBE0]/55 sm:px-6">
              No offers are available for this screening right now.
            </div>
          )}
        </section>

        <p className="px-1 text-[11px] leading-5 text-[#EFEBE0]/45">
          By proceeding, I express my consent to complete this transaction. Your seats stay reserved until {formatExpiry(hold.expiresAt)}.
        </p>

        {order?.checkoutUrl && (
          <p className="px-1 text-[11px] leading-5 text-[#EFEBE0]/40">
            Payment window not appearing?{' '}
            <a
              href={order.checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#F4B63F] underline-offset-2 hover:text-[#ffd27a]"
            >
              Open the secure payment page
            </a>
          </p>
        )}

        {status && (
          <div role="status" aria-live="polite" className="flex items-start gap-3 rounded-xl border border-[#F4B63F]/20 bg-[#F4B63F]/[0.07] px-4 py-3 text-sm text-[#F4B63F]">
            <span className="material-symbols-outlined text-lg">{loading ? 'progress_activity' : 'info'}</span>
            <span>{status}</span>
          </div>
        )}
        {error && (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-[#C2305E]/35 bg-[#C2305E]/10 px-4 py-3 text-sm text-[#ffb5c7]">
            <span className="material-symbols-outlined text-lg">error</span>
            <span>{error}</span>
          </div>
        )}
      </main>

      {/* Pay bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#0A2A31]/15 bg-[#EFEBE0] text-[#0A2A31] shadow-[0_-10px_30px_rgba(0,0,0,.25)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#0A2A31]/45">Order total</p>
            <p className="kk-display truncate text-xl font-bold leading-tight">{rupees(totalMinor)}</p>
          </div>
          <button
            type="button"
            onClick={payNow}
            disabled={loading}
            className="kk-pay min-w-[160px] rounded-lg px-6 py-3.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-55 sm:min-w-[210px]"
            style={{ background: C.kokum }}
          >
            {payLabel}
          </button>
        </div>
      </div>

      {notice && (
        <div
          className="kk-toast fixed bottom-24 left-1/2 z-50 max-w-[90vw] -translate-x-1/2 rounded-lg px-4 py-2.5 text-center text-xs font-semibold shadow-xl"
          style={{ background: C.shell, color: C.ink }}
          role="status"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
