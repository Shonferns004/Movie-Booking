import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../services/api.js';

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
    script.onerror = () => reject(new Error('Failed to load Youpi SDK'));
    document.head.appendChild(script);
  }).catch((error) => {
    // Allow a later attempt if the network or SDK script fails to load.
    youpiScriptPromise = null;
    throw error;
  });

  return youpiScriptPromise;
}

function formatExpiry(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString();
}

export default function Checkout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const [hold] = useState(() => {
    if (location.state) return location.state;
    try {
      return JSON.parse(localStorage.getItem('currentHold') || 'null');
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (!hold) navigate('/', { replace: true });
  }, [hold, navigate]);

  if (!hold) {
    return (
      <main className="min-h-screen bg-[#0A2A31] px-5 py-16 text-[#EFEBE0]">
        <div className="mx-auto max-w-lg rounded-3xl border border-[#EFEBE0]/10 bg-[#123E47] p-8 text-center shadow-2xl">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#C2305E]/15 text-[#C2305E]">
            <span className="material-symbols-outlined text-3xl">confirmation_number</span>
          </span>
          <h1 className="font-headline-md text-2xl font-semibold">No active seat hold</h1>
          <p className="mt-2 text-sm leading-6 text-[#EFEBE0]/65">Choose your seats first, then return here to complete your booking.</p>
          <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-full bg-[#C2305E] px-6 py-3 text-sm font-semibold text-[#EFEBE0] transition hover:bg-[#d34270]">
            Browse movies <span className="material-symbols-outlined ml-2 text-lg">arrow_forward</span>
          </Link>
        </div>
      </main>
    );
  }

  const total = Number(hold.totalMinor || 0) / 100;
  const currency = hold.currency || 'INR';

  async function checkout() {
    if (loading) return;
    setLoading(true);
    setError('');
    setStatus('Preparing your secure checkout…');

    try {
      const bookingResponse = await api.post('/bookings', {
        holdId: hold.holdId,
        contactEmail: email.trim() || undefined,
        contactMobile: mobile.trim() || undefined,
        sessionRef: localStorage.getItem('sessionRef') || undefined,
      });
      const booking = bookingResponse.data;

      const orderResponse = await api.post('/payments/youpi/orders', {
        bookingReference: booking.booking_reference,
        customer: {
          email: email.trim() || undefined,
          mobile: mobile.trim() || undefined,
        },
      });
      const order = orderResponse.data;

      const Youpi = await loadYoupiScript(order.scriptUrl, order.merchantKey, {
        apiUrl: order.apiUrl,
        portalUrl: order.portalUrl,
      });

      setStatus('Secure payment window opened. Complete payment to confirm your tickets.');
      Youpi.pay({
        // Reuse the checkout session created by the server.
        checkoutUrl: order.checkoutUrl,
        order_id: order.orderId,
        amount: Number(order.amount),
        currency: order.currency,
        name: 'Konkani Samudai Cinema',
        description: `Booking ${booking.booking_reference}`,
        handler: async (response) => {
          if (response && response.status === 'SUCCESS') {
            setStatus('Payment received. Confirming your tickets…');
            try {
              await api.post('/payments/youpi/confirm', {
                orderId: order.orderId,
                utr: response.utr,
                amountPaise: order.amountMinor,
              });
            } catch (confirmError) {
              // The payment webhook may already have confirmed this transaction.
              console.warn('Client confirmation failed; relying on payment webhook.', confirmError);
            }
            localStorage.removeItem('currentHold');
            navigate(`/booking/${booking.booking_reference}`);
          } else {
            setStatus('Payment was not completed. You can retry from the booking page.');
            setLoading(false);
          }
        },
        onClose: () => {
          setStatus('Payment window closed. Your booking may still be pending confirmation.');
          setLoading(false);
        },
      });
    } catch (checkoutError) {
      setError(checkoutError.response?.data?.error || checkoutError.message || 'Unable to start checkout. Please try again.');
      setStatus('');
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0A2A31] px-4 py-8 text-[#EFEBE0] sm:px-6 sm:py-12">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-[#C2305E]/10 blur-[120px]" />
      <div className="relative mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="group inline-flex items-center gap-3 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#F4B63F]">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#123E47] text-[#F4B63F] ring-1 ring-[#EFEBE0]/10">
              <span className="material-symbols-outlined text-2xl">movie_filter</span>
            </span>
            <span>
              <span className="block text-sm font-bold tracking-[0.14em]">KONKANI SAMUDAI</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-[#EFEBE0]/50">Your cinema, your community</span>
            </span>
          </Link>
          <div className="hidden items-center gap-2 rounded-full border border-[#EFEBE0]/10 bg-[#123E47]/70 px-3 py-2 text-xs text-[#EFEBE0]/70 sm:flex">
            <span className="material-symbols-outlined text-base text-[#F4B63F]">lock</span>
            Secure checkout
          </div>
        </header>

        <div className="mb-8 max-w-2xl">
          <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] text-[#F4B63F]">
            <span className="h-px w-7 bg-[#F4B63F]" /> Final step
          </p>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>
            Make it a <span className="text-[#F4B63F]">movie night.</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[#EFEBE0]/65 sm:text-base">
            Confirm your contact details and continue to secure payment. Your seats are held temporarily, so finish checkout before the hold expires.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <section className="rounded-3xl border border-[#EFEBE0]/10 bg-[#123E47]/75 p-5 shadow-2xl backdrop-blur-sm sm:p-8">
            <div className="mb-7 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/45">01 / Contact details</p>
                <h2 className="mt-2 text-2xl font-semibold" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>Where should we send your tickets?</h2>
                <p className="mt-2 text-sm leading-6 text-[#EFEBE0]/60">Add at least one contact method so your booking details can reach you.</p>
              </div>
              <span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F4B63F]/10 text-[#F4B63F] sm:flex">
                <span className="material-symbols-outlined text-2xl">mark_email_read</span>
              </span>
            </div>

            <div className="space-y-5">
              <div>
                <label htmlFor="checkout-email" className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#EFEBE0]/65">Email address <span className="font-normal normal-case tracking-normal text-[#EFEBE0]/35">(optional)</span></label>
                <div className="flex items-center rounded-xl border border-[#EFEBE0]/10 bg-[#071E23]/65 transition focus-within:border-[#F4B63F]/70 focus-within:ring-2 focus-within:ring-[#F4B63F]/10">
                  <span className="pl-4 text-[#EFEBE0]/35"><span className="material-symbols-outlined text-xl">mail</span></span>
                  <input
                    id="checkout-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent px-3 py-4 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="checkout-mobile" className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-[#EFEBE0]/65">Mobile number <span className="font-normal normal-case tracking-normal text-[#EFEBE0]/35">(optional)</span></label>
                <div className="flex items-center rounded-xl border border-[#EFEBE0]/10 bg-[#071E23]/65 transition focus-within:border-[#F4B63F]/70 focus-within:ring-2 focus-within:ring-[#F4B63F]/10">
                  <span className="pl-4 text-[#EFEBE0]/35"><span className="material-symbols-outlined text-xl">smartphone</span></span>
                  <input
                    id="checkout-mobile"
                    type="tel"
                    autoComplete="tel"
                    inputMode="tel"
                    value={mobile}
                    onChange={(event) => setMobile(event.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 20))}
                    placeholder="98765 43210"
                    className="w-full bg-transparent px-3 py-4 text-sm text-[#EFEBE0] outline-none placeholder:text-[#EFEBE0]/30"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-3 rounded-2xl border border-[#F4B63F]/15 bg-[#F4B63F]/[0.06] p-4">
              <span className="material-symbols-outlined mt-0.5 text-xl text-[#F4B63F]">info</span>
              <p className="text-xs leading-5 text-[#EFEBE0]/65">Your payment is processed through the payment gateway. Do not refresh or close this page while payment is being confirmed.</p>
            </div>

            {status && (
              <div role="status" aria-live="polite" className="mt-5 flex gap-3 rounded-xl border border-[#F4B63F]/20 bg-[#F4B63F]/[0.07] px-4 py-3 text-sm text-[#F4B63F]">
                <span className="material-symbols-outlined text-lg">{loading ? 'progress_activity' : 'info'}</span>
                <span>{status}</span>
              </div>
            )}
            {error && (
              <div role="alert" className="mt-5 flex gap-3 rounded-xl border border-[#C2305E]/35 bg-[#C2305E]/10 px-4 py-3 text-sm text-[#ffb5c7]">
                <span className="material-symbols-outlined text-lg">error</span>
                <span>{error}</span>
              </div>
            )}
          </section>

          <aside className="overflow-hidden rounded-3xl border border-[#EFEBE0]/10 bg-[#123E47] shadow-2xl">
            <div className="border-b border-dashed border-[#EFEBE0]/15 bg-[#071E23]/35 p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/45">02 / Order summary</p>
                <span className="rounded-full bg-[#C2305E]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#ff9bb5]">Reserved</span>
              </div>
              <div className="mt-6 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F4B63F]/10 text-[#F4B63F]">
                  <span className="material-symbols-outlined text-3xl">confirmation_number</span>
                </div>
                <div>
                  <h2 className="text-xl font-semibold" style={{ fontFamily: 'Fraunces, Georgia, serif' }}>Your cinema pass</h2>
                  <p className="mt-1 text-xs text-[#EFEBE0]/50">Konkani Samudai · Digital booking</p>
                </div>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#EFEBE0]/8 bg-[#0A2A31]/60 p-4">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#EFEBE0]/40">Seats</span>
                  <span className="mt-1 block text-2xl font-semibold text-[#EFEBE0]">{hold.seatCount ?? '—'}</span>
                </div>
                <div className="rounded-xl border border-[#EFEBE0]/8 bg-[#0A2A31]/60 p-4">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.15em] text-[#EFEBE0]/40">Currency</span>
                  <span className="mt-1 block text-2xl font-semibold text-[#EFEBE0]">{currency}</span>
                </div>
              </div>
            </div>

            <div className="p-6 sm:p-7">
              <div className="flex items-center justify-between gap-4 text-sm">
                <span className="text-[#EFEBE0]/60">Ticket subtotal</span>
                <span className="font-medium tabular-nums">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div className="mt-4 flex items-center justify-between gap-4 border-t border-[#EFEBE0]/10 pt-4">
                <span className="text-sm font-semibold">Total to pay</span>
                <span className="text-2xl font-bold tracking-tight text-[#F4B63F] tabular-nums">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>

              <div className="mt-5 rounded-xl bg-[#071E23]/55 p-4">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-lg text-[#F4B63F]">hourglass_top</span>
                  <div>
                    <p className="text-xs font-semibold">Seat hold expires</p>
                    <p className="mt-1 text-xs leading-5 text-[#EFEBE0]/55">{formatExpiry(hold.expiresAt)}</p>
                  </div>
                </div>
              </div>

              <button
                onClick={checkout}
                disabled={loading}
                className="group mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#C2305E] px-5 py-4 text-sm font-bold text-[#EFEBE0] shadow-lg shadow-[#C2305E]/15 transition duration-200 hover:-translate-y-0.5 hover:bg-[#d34270] hover:shadow-[#C2305E]/25 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
              >
                {loading ? (
                  <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span> Opening secure payment…</>
                ) : (
                  <>Pay ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<span className="material-symbols-outlined text-lg transition-transform group-hover:translate-x-1">arrow_forward</span></>
                )}
              </button>
              <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[11px] text-[#EFEBE0]/40">
                <span className="material-symbols-outlined text-sm">shield_lock</span>
                Secure payment · Your ticket is confirmed after payment verification
              </p>
              <Link to="/" className="mt-5 flex items-center justify-center gap-1 text-xs font-medium text-[#EFEBE0]/55 transition hover:text-[#F4B63F]">
                <span className="material-symbols-outlined text-base">arrow_back</span> Back to movies
              </Link>
            </div>
          </aside>
        </div>

        <footer className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-[#EFEBE0]/10 pt-5 text-center text-[11px] text-[#EFEBE0]/35 sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} Konkani Samudai Cinema</span>
          <span className="flex items-center gap-2"><span className="material-symbols-outlined text-sm text-[#F4B63F]">verified_user</span> Protected checkout experience</span>
        </footer>
      </div>
    </main>
  );
}
