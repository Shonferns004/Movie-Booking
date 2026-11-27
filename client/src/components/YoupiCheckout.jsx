import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  @keyframes kk-coin-flip {
    0% { transform: rotateY(0deg) translateY(0); }
    50% { transform: rotateY(180deg) translateY(-8px); }
    100% { transform: rotateY(360deg) translateY(0); }
  }
  .kk-coin {
    width: 78px; height: 78px; border-radius: 50%;
    display: grid; place-items: center;
    background: linear-gradient(145deg, #fde68a, #f59e0b);
    box-shadow: 0 12px 34px rgba(245, 158, 11, 0.35);
    transform-style: preserve-3d;
    animation: kk-coin-flip 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .kk-coin span { font-size: 34px; font-weight: 900; color: #7c2d12; }
  @media (prefers-reduced-motion: reduce) {
    .kk-coin { animation: none; }
  }
`;

const clock = (total) => {
  const safe = Math.max(0, Number(total) || 0);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

export default function YoupiCheckout({ order, booking, onSuccess, onBack }) {
  const paymentId = order?.paymentId;
  const [state, setState] = useState(null);
  const [seconds, setSeconds] = useState(300);
  const [mode, setMode] = useState('idle');
  const [error, setError] = useState('');
  const [cancelBusy, setCancelBusy] = useState(false);
  const completedRef = useRef(false);

  const amount = state?.amount || order?.amount || '0';
  const payeeVpa = state?.payeeVpa || order?.upiId || '';
  const payeeName = state?.payeeName || order?.payeeName || 'Konkani Samudai';
  const upiUri = payeeVpa
    ? `upi://pay?${new URLSearchParams({
        pa: payeeVpa,
        pn: payeeName,
        am: String(amount),
        cu: 'INR',
        tn: `Booking ${booking?.booking_reference || order?.bookingReference || ''}`,
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

  useEffect(() => {
    if (!paymentId) return undefined;
    let alive = true;
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
      });
    return () => {
      alive = false;
    };
  }, [paymentId]);

  const checkStatus = useCallback(async () => {
    if (!paymentId || completedRef.current) return;
    try {
      const response = await api.get(`/payments/youpi/status/${paymentId}`);
      const status = String(response.data?.status || '').toUpperCase();
      if (status === 'SUCCESS') {
        completedRef.current = true;
        setMode('done');
        onSuccess?.({ paymentId, booking });
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
        if (next === 0) setMode((current) => (current === 'done' ? current : 'expired'));
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode]);

  /**
   * Build the app launch target. On Android an `intent:` URL with an explicit
   * package opens the app directly instead of showing Chrome's "Open in app?"
   * prompt; iOS keeps using each app's own scheme.
   */
  function appTarget(app, query) {
    if (isAndroidDevice()) {
      return `intent://pay?${query}#Intent;scheme=upi;${app.pkg ? `package=${app.pkg};` : ''}end`;
    }
    return `${app.scheme}?${query}`;
  }

  function handleLaunch(event, app) {
    if (!upiUri) {
      event.preventDefault();
      setError('Payment details are still loading. Please wait a second.');
      return;
    }
    setError('');
    // Let the anchor's own navigation open the app (a real link is not blocked
    // by browser popup rules); only show the waiting overlay if we stay here.
    window.setTimeout(() => setMode('confirming'), 900);
  }

  function appHref(app) {
    if (!upiUri) return undefined;
    return appTarget(app, upiUri.split('?')[1] || '');
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

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-[#0B0C0D]/82 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Secure UPI payment"
    >
      <style>{COIN_CSS}</style>
      <div className="relative flex max-h-[94dvh] w-full max-w-none flex-col overflow-hidden rounded-t-[26px] bg-[#252A30] text-[#F2F0EB] shadow-[0_40px_110px_-40px_rgba(0,0,0,0.9)] sm:max-w-[460px] sm:rounded-[26px]">
        <div className="flex items-center justify-between gap-3 border-b border-[#B5AFA6]/12 px-5 py-3.5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#C8FF1F]">Secure payment</p>
            <p className="mt-0.5 font-editorial text-lg font-semibold leading-tight">Konkani Samudai</p>
          </div>
          <button
            type="button"
            onClick={cancelPayment}
            disabled={cancelBusy}
            aria-label="Cancel payment"
            className="grid h-9 w-9 place-items-center rounded-full border border-[#B5AFA6]/20 text-[#B5AFA6] transition-colors hover:border-[#C8FF1F] hover:text-[#C8FF1F] disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[#B5AFA6]">Amount</p>
              <p className="font-mono text-3xl font-bold leading-none text-[#F2F0EB]">₹{amount}</p>
            </div>
            <div className="rounded-xl border border-[#B5AFA6]/20 bg-[#1E2227] px-3 py-2 text-center">
              <p className="font-mono text-sm font-semibold tabular-nums text-[#C8FF1F]">{clock(seconds)}</p>
              <p className="mt-0.5 text-[8px] uppercase tracking-[0.14em] text-[#B5AFA6]">Time left</p>
            </div>
          </div>

          <div className="mt-4 hidden justify-center rounded-2xl bg-white p-4 sm:flex">
            {upiUri ? (
              <QRCodeSVG value={upiUri} size={188} level="M" bgColor="#ffffff" fgColor="#1E2227" />
            ) : (
              <div className="flex h-[188px] w-[188px] animate-pulse items-center justify-center rounded-lg bg-[#E9E7E2]" />
            )}
          </div>
          <p className="mt-2 hidden text-center text-[10px] text-[#B5AFA6] sm:block">
            Scan with any UPI app, or pay on this device below.
          </p>

          <div className="mt-4 space-y-2 sm:hidden">
            {UPI_APPS.map((app) => (
              <a
                key={app.id}
                href={appHref(app)}
                onClick={(event) => handleLaunch(event, app)}
                className="flex h-12 w-full items-center gap-3 rounded-xl border border-[#B5AFA6]/18 bg-[#1E2227] px-3 text-left text-sm font-semibold transition-colors hover:border-[#C8FF1F]"
              >
                <img src={app.icon} alt="" className="h-6 w-6 rounded" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                <span>{app.label}</span>
                <span className="ml-auto text-[#B5AFA6]">›</span>
              </a>
            ))}
          </div>

          <div className="mt-4 space-y-2 sm:flex sm:items-center sm:gap-2">
            {UPI_APPS.slice(0, 3).map((app) => (
              <a
                key={app.id}
                href={appHref(app)}
                onClick={(event) => handleLaunch(event, app)}
                className="hidden h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-[#B5AFA6]/18 bg-[#1E2227] text-xs font-semibold transition-colors hover:border-[#C8FF1F] sm:flex"
              >
                <img src={app.icon} alt="" className="h-5 w-5 rounded" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} />
                {app.label}
              </a>
            ))}
          </div>

          {error && <p className="mt-3 text-xs text-[#F08A80]">{error}</p>}

          <p className="mt-4 text-[10px] leading-relaxed text-[#B5AFA6]">
            Payment is detected automatically. You&apos;ll come back here after paying.
          </p>

          <button
            type="button"
            onClick={cancelPayment}
            disabled={cancelBusy}
            className="mt-4 w-full rounded-xl border border-[#B5AFA6]/25 py-2.5 text-[11px] font-semibold text-[#B5AFA6] transition-colors hover:border-[#F08A80] hover:text-[#F08A80] disabled:opacity-50"
          >
            {cancelBusy ? 'Cancelling…' : 'Cancel payment'}
          </button>
        </div>

        {mode === 'confirming' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-[#1E2227]/97 px-6 text-center">
            <div className="kk-coin" aria-hidden="true"><span>₹</span></div>
            <p className="text-sm font-semibold">Confirming your payment…</p>
            <p className="max-w-[260px] text-[11px] leading-relaxed text-[#B5AFA6]">
              Keep this screen open. It updates by itself when the bank confirms.
            </p>
            <button
              type="button"
              onClick={() => setMode('idle')}
              className="rounded-full border border-[#B5AFA6]/30 px-4 py-2 text-[11px] font-semibold text-[#F2F0EB]"
            >
              Cancel
            </button>
          </div>
        )}

        {mode === 'done' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#1E2227]/97 px-6 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[#C8FF1F] text-2xl font-bold text-[#1E2227]">✓</span>
            <p className="text-sm font-semibold">Payment received</p>
            <p className="text-[11px] text-[#B5AFA6]">Opening your ticket…</p>
          </div>
        )}
      </div>
    </div>
  );
}
