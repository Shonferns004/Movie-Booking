import { useCallback, useEffect, useRef, useState } from 'react';
import StyledQr from './StyledQr.jsx';
import SamudaiPayLoader from './SamudaiPayLoader.jsx';
import api from '../services/api.js';

const UPI_APPS = [
  { id: 'gpay', label: 'GPay', icon: '/icons/gpay.png', scheme: 'tez://upi/pay', pkg: 'com.google.android.apps.nbu.paisa.user' },
  { id: 'phonepe', label: 'PhonePe', icon: '/icons/phonepe.png', scheme: 'phonepe://pay', pkg: 'com.phonepe.app' },
  { id: 'paytm', label: 'Paytm', icon: '/icons/paytm.png', scheme: 'paytmmp://pay', pkg: 'net.one97.paytm' },
  { id: 'other', label: 'Other UPI', icon: '/icons/upi.svg', scheme: 'upi://pay', pkg: null },
];

const isAndroidDevice = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');

const COIN_CSS = `
  .kk-coin-stage { perspective: 800px; }
  .kk-coin3d {
    position: relative;
    width: 88px;
    height: 88px;
    transform-style: preserve-3d;
    animation: kk-coin-flip 1.5s cubic-bezier(0.45, 0, 0.25, 1) infinite;
  }
  .kk-coin3d__face {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: 999px;
    backface-visibility: hidden;
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 34px;
    font-weight: 700;
  }
  .kk-coin3d__front {
    color: #5a3a00;
    background: radial-gradient(circle at 32% 28%, #fff0b8, #f2c14e 45%, #c98a12 100%);
    box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.35), 0 14px 36px rgba(201, 138, 18, 0.4);
  }
  .kk-coin3d__back {
    color: #1e2227;
    background: radial-gradient(circle at 32% 28%, #eaff9f, #c8ff1f 45%, #8fbb00 100%);
    transform: rotateY(180deg);
    box-shadow: inset 0 0 0 4px rgba(255, 255, 255, 0.28), 0 14px 36px rgba(200, 255, 31, 0.28);
  }
  @keyframes kk-coin-flip {
    0% { transform: rotateY(0deg) rotateX(8deg); }
    50% { transform: rotateY(180deg) rotateX(-6deg); }
    100% { transform: rotateY(360deg) rotateX(8deg); }
  }
  @media (prefers-reduced-motion: reduce) {
    .kk-coin3d { animation: none; }
  }
`;

const clock = (total) => {
  const safe = Math.max(0, Number(total) || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const money = (value) => {
  const number = Number(value) || 0;
  return `₹${number.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const maskPhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '').slice(-10);
  if (digits.length < 4) return null;
  return `+91 ${digits.slice(0, 2)}•••••${digits.slice(-3)}`;
};

export default function YoupiCheckout({
  order,
  booking,
  payerName = '',
  payerMobile = '',
  seatCount = 0,
  onSuccess,
  onRetry,
  onBack,
}) {
  const paymentId = order?.paymentId;
  const [state, setState] = useState(null);
  const [seconds, setSeconds] = useState(300);
  const [mode, setMode] = useState('idle');
  const [stateReady, setStateReady] = useState(false);
  const [selectedApp, setSelectedApp] = useState('gpay');
  const [error, setError] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const completedRef = useRef(false);
  const timersRef = useRef([]);

  const amount = state?.amount || order?.amount || '0';
  const ticketMinor = Number(order?.baseAmountMinor ?? order?.amountMinor ?? 0);
  const seatTotal = Number.isFinite(ticketMinor) ? ticketMinor / 100 : 0;
  const payeeVpa = state?.payeeVpa || order?.upiId || '';
  const payeeName = state?.payeeName || order?.payeeName || 'Konkani Samudai';
  const name = String(payerName || booking?.contact_name || '').trim() || 'Guest';
  const initial = name.charAt(0).toUpperCase() || 'G';
  const phone = maskPhone(payerMobile || booking?.contact_mobile);
  const reference = booking?.booking_reference || order?.bookingReference || '';
  const upiUri = payeeVpa
    ? `upi://pay?${new URLSearchParams({
        pa: payeeVpa,
        pn: payeeName,
        am: String(amount),
        cu: 'INR',
        tn: `Booking ${reference}`,
        tr: String(order?.orderId || paymentId || ''),
      }).toString()}`
    : '';

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }, []);

  useEffect(() => {
    if (!paymentId) return undefined;
    let alive = true;
    const startedAt = Date.now();
    let readyTimer = null;
    const showMain = () => {
      if (!alive) return;
      // Keep the branded intro on screen long enough to read, even on a fast network.
      const wait = Math.max(0, 700 - (Date.now() - startedAt));
      readyTimer = window.setTimeout(() => {
        if (alive) setStateReady(true);
      }, wait);
    };
    api
      .get(`/payments/youpi/checkout/${paymentId}`)
      .then((response) => {
        if (!alive) return;
        setState(response.data);
        if (response.data?.timeRemainingSeconds != null) {
          setSeconds(Number(response.data.timeRemainingSeconds));
        }
      })
      .catch(() => {
        // The timer still runs from the order; the QR can use the order's UPI id.
      })
      .finally(showMain);
    // Never leave the branded loader up if the gateway stalls.
    const fallback = window.setTimeout(() => {
      if (alive) setStateReady(true);
    }, 6000);
    return () => {
      alive = false;
      if (readyTimer) window.clearTimeout(readyTimer);
      window.clearTimeout(fallback);
    };
  }, [paymentId]);

  const checkStatus = useCallback(async () => {
    if (!paymentId || completedRef.current) return;
    try {
      const response = await api.get(`/payments/youpi/status/${paymentId}`);
      const status = String(response.data?.status || '').toUpperCase();
      if (status === 'SUCCESS') {
        completedRef.current = true;
        // The bank has acknowledged: play the coin flip first, then the tick,
        // and only then move the customer to their ticket.
        setMode('verifying');
        const settle = window.setTimeout(() => {
          setMode('done');
          const finish = window.setTimeout(() => {
            onSuccess?.({ paymentId, booking });
          }, 1000);
          timersRef.current.push(finish);
        }, 2000);
        timersRef.current.push(settle);
      } else if (status === 'EXPIRED') {
        setMode('expired');
        setError('The payment window expired. Go back and try again.');
      } else if (status === 'FAILED') {
        setMode('failed');
        setError('The payment did not go through. You can try again.');
      } else if (status === 'CANCELLED') {
        setMode('cancelled');
        setError('This payment was cancelled.');
      }
    } catch {
      // Keep polling while the UPI app is in front.
    }
  }, [paymentId, booking, onSuccess]);

  useEffect(() => {
    if (!paymentId) return undefined;
    checkStatus();
    const timer = window.setInterval(checkStatus, 3000);
    return () => window.clearInterval(timer);
  }, [paymentId, checkStatus]);

  useEffect(() => {
    if (mode === 'expired' || mode === 'done') return undefined;
    const timer = window.setInterval(() => {
      setSeconds((value) => {
        const next = Math.max(0, value - 1);
        if (next === 0) setMode((current) => (current === 'done' || current === 'verifying' ? current : 'expired'));
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  /**
   * Android opens an explicit package through an `intent:` URL, which launches
   * the app directly instead of showing Chrome's "Open in app?" prompt.
   */
  function appTarget(app, query) {
    if (isAndroidDevice()) {
      return `intent://pay?${query}#Intent;scheme=upi;${app.pkg ? `package=${app.pkg};` : ''}end`;
    }
    return `${app.scheme}?${query}`;
  }

  function continuePayment() {
    const app = UPI_APPS.find((item) => item.id === selectedApp);
    if (!app || !upiUri) {
      setError('Payment details are still loading. Please wait a second.');
      return;
    }
    setError('');
    window.location.href = appTarget(app, upiUri.split('?')[1] || '');
  }

  async function cancelPayment() {
    if (cancelBusy) return;
    setCancelBusy(true);
    try {
      if (paymentId) await api.post(`/payments/youpi/checkout/${paymentId}/cancel`);
    } catch {
      // Even if the gateway call fails, release the UI.
    } finally {
      setCancelBusy(false);
      onBack?.();
    }
  }

  if (!order) return null;

  const activeApp = UPI_APPS.find((item) => item.id === selectedApp);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-[#0B0C0D]/82 backdrop-blur-sm lg:items-center lg:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Payment options"
    >
      <style>{COIN_CSS}</style>
      <div className="relative flex max-h-[94dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[26px] bg-[#1E2227] text-[#F2F0EB] shadow-[0_40px_110px_-40px_rgba(0,0,0,0.9)] sm:max-w-[560px] lg:h-[600px] lg:max-w-[880px] lg:flex-row lg:rounded-[20px]">
        {/* Desktop summary rail */}
        <aside className="hidden w-[300px] shrink-0 flex-col bg-[#252A30] px-6 py-7 lg:flex">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[#C8FF1F] font-editorial text-lg font-bold text-[#1E2227]">
              {initial}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{name}</p>
              <p className="truncate text-[11px] text-[#B5AFA6]">{phone || 'Guest checkout'}</p>
            </div>
          </div>

          <div className="mt-7 rounded-2xl bg-[#2B3037] p-4">
            <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#B5AFA6]">Price summary</p>
            <div className="mt-3 space-y-2 text-xs text-[#B5AFA6]">
              <div className="flex items-center justify-between gap-3">
                <span>{seatCount ? `Tickets (${seatCount})` : 'Tickets'}</span>
                <span className="font-mono text-[#F2F0EB]">{money(seatTotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Booking fee</span>
                <span className="font-mono text-[#F2F0EB]">₹0.00</span>
              </div>
            </div>
            <div className="mt-3 border-t border-[#B5AFA6]/15 pt-3">
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#B5AFA6]">To pay now</p>
              <div className="mt-1 flex items-end justify-between gap-2">
                <span className="font-mono text-2xl font-bold leading-none text-[#C8FF1F]">{money(amount)}</span>
                <span className="rounded-md bg-[#1E2227] px-2 py-1 font-mono text-[11px] tabular-nums text-[#B5AFA6]">
                  {clock(seconds)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-[#2B3037] px-3 py-2.5">
            <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#B5AFA6]">Using as</p>
            <p className="mt-0.5 font-mono text-xs text-[#F2F0EB]">{phone || 'No number on file'}</p>
          </div>

          {reference && <p className="mt-4 text-[10px] text-[#B5AFA6]">Booking {reference}</p>}

          <div className="mt-auto pt-6">
            <p className="text-[10px] text-[#B5AFA6]">
              Secured by <span className="font-semibold text-[#F2F0EB]">Konkani Samudai</span>
            </p>
            <p className="mt-1 text-[9px] leading-relaxed text-[#B5AFA6]/70">
              UPI is processed by the YouPI payment gateway. You will return here after paying.
            </p>
          </div>
        </aside>

        {/* Payment options */}
        <section className="flex min-h-0 flex-1 flex-col bg-[#1E2227]">
          <header className="relative flex items-center justify-center px-5 py-4">
            <p className="font-editorial text-base font-semibold">Payment Options</p>
            <button
              type="button"
              onClick={cancelPayment}
              disabled={cancelBusy}
              aria-label="Close payment"
              className="absolute right-4 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-[#B5AFA6] transition-colors hover:text-[#F2F0EB] disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 sm:px-6 lg:overflow-hidden">
            {/* Mobile / tablet summary */}
            <div className="lg:hidden">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#B5AFA6]">To pay now</p>
                  <p className="font-mono text-3xl font-bold leading-none">{money(amount)}</p>
                  <p className="mt-1 text-[10px] text-[#B5AFA6]">
                    {seatCount ? `${seatCount} ticket${seatCount > 1 ? 's' : ''}` : 'Tickets'} · {phone || name}
                  </p>
                </div>
                <div className="rounded-xl bg-[#252A30] px-3 py-2 text-center">
                  <p className="font-mono text-sm font-semibold tabular-nums text-[#C8FF1F]">{clock(seconds)}</p>
                  <p className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-[#B5AFA6]">Time left</p>
                </div>
              </div>
            </div>

            {/* Desktop QR (laptops have no UPI apps installed) */}
            <div className="hidden lg:flex lg:min-h-full lg:flex-col lg:items-center lg:justify-center lg:py-2 lg:text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#C8FF1F]">Scan &amp; pay</p>
              <p className="mt-2 font-mono text-4xl font-bold leading-none text-[#F2F0EB]">{money(amount)}</p>
              <p className="mt-2 max-w-[300px] text-xs leading-relaxed text-[#B5AFA6]">
                Open any UPI app on your phone and scan this code to pay.
              </p>
              <div className="mt-5 rounded-[22px] bg-white p-3 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.8)]">
                {upiUri ? (
                  <StyledQr value={upiUri} size={190} background="#ffffff" accent="#1E2227" margin={0} />
                ) : (
                  <div className="h-[190px] w-[190px] animate-pulse rounded-lg bg-[#E9E7E2]" />
                )}
              </div>
              <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#B5AFA6]">
                GPay · PhonePe · Paytm · any UPI app
              </p>
              <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#252A30] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#C8FF1F]" aria-hidden="true" />
                <span className="font-mono text-[11px] tabular-nums text-[#B5AFA6]">{clock(seconds)} left</span>
              </div>
              <p className="mt-4 text-[10px] text-[#B5AFA6]">
                Payment is detected automatically. You&apos;ll come back here after paying.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-between lg:hidden">
              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#B5AFA6]">UPI apps</p>
              <span className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#C8FF1F]">Instant · No fee</span>
            </div>

            <div className="mt-2 space-y-2 lg:hidden">
              {UPI_APPS.map((app) => {
                const active = selectedApp === app.id;
                return (
                  <button
                    key={app.id}
                    type="button"
                    onClick={() => setSelectedApp(app.id)}
                    className={`flex h-[54px] w-full items-center gap-3 rounded-xl px-3 text-left transition-colors ${
                      active ? 'bg-[#C8FF1F]/10' : 'bg-[#252A30] hover:bg-[#2B3037]'
                    }`}
                  >
                    <img
                      src={app.icon}
                      alt=""
                      className="h-7 w-7 rounded-md"
                      onError={(event) => {
                        event.currentTarget.style.visibility = 'hidden';
                      }}
                    />
                    <span className="flex-1 text-sm font-semibold">{app.label}</span>
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full ${
                        active ? 'bg-[#C8FF1F] text-[#1E2227]' : 'bg-[#B5AFA6]/20'
                      }`}
                    >
                      {active && (
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                          <path d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            {error && <p className="mt-3 text-xs text-[#F08A80]">{error}</p>}

            <p className="mt-4 text-[10px] leading-relaxed text-[#B5AFA6] lg:hidden">
              Payment is detected automatically. You&apos;ll come back here after paying.
            </p>
          </div>

          <div className="shrink-0 px-5 pb-5 sm:px-6 sm:pb-6">
            <button
              type="button"
              onClick={continuePayment}
              disabled={!selectedApp || !upiUri || mode === 'expired'}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-[#C8FF1F] text-sm font-bold text-[#1E2227] transition-colors hover:bg-[#d7ff5c] disabled:cursor-not-allowed disabled:bg-[#B5AFA6]/20 disabled:text-[#B5AFA6] lg:hidden"
            >
              {activeApp ? `Continue with ${activeApp.label}` : 'Continue'}
            </button>
            <button
              type="button"
              onClick={cancelPayment}
              disabled={cancelBusy}
              className="mt-2 w-full py-2 text-[11px] font-semibold text-[#B5AFA6] transition-colors hover:text-[#F08A80] disabled:opacity-50 lg:mt-0"
            >
              {cancelBusy ? 'Cancelling…' : 'Cancel payment'}
            </button>
          </div>
        </section>

        {!stateReady && mode === 'idle' && <SamudaiPayLoader />}

        {mode === 'verifying' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#1E2227] px-6 text-center">
            <div className="kk-coin-stage" aria-hidden="true">
              <div className="kk-coin3d">
                <div className="kk-coin3d__face kk-coin3d__front">₹</div>
                <div className="kk-coin3d__face kk-coin3d__back">KS</div>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold">Payment received</p>
              <p className="mt-1 text-[11px] text-[#B5AFA6]">Confirming with your bank…</p>
            </div>
          </div>
        )}

        {mode === 'expired' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#1E2227] px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#252A30] text-[#B5AFA6]" aria-hidden="true">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold">Payment window expired</p>
              <p className="mt-1 max-w-[280px] text-[11px] leading-relaxed text-[#B5AFA6]">
                Your seats are still held. Retry for a fresh payment window, or go back to the seat map.
              </p>
            </div>
            <div className="mt-1 flex w-full max-w-[280px] gap-2">
              <button
                type="button"
                onClick={() => (onRetry ? onRetry() : onBack?.())}
                className="h-11 flex-1 rounded-xl bg-[#C8FF1F] text-xs font-bold text-[#1E2227] transition-colors hover:bg-[#d7ff5c]"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={cancelPayment}
                disabled={cancelBusy}
                className="h-11 flex-1 rounded-xl bg-[#252A30] text-xs font-semibold text-[#F2F0EB] transition-colors hover:bg-[#2B3037] disabled:opacity-50"
              >
                {cancelBusy ? 'Cancelling…' : 'Cancel'}
              </button>
            </div>
          </div>
        )}

        {mode === 'done' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#1E2227] px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#C8FF1F] text-2xl font-bold text-[#1E2227]">✓</span>
            <p className="text-sm font-semibold">Payment received</p>
            <p className="text-[11px] text-[#B5AFA6]">Opening your ticket…</p>
          </div>
        )}
      </div>
    </div>
  );
}
