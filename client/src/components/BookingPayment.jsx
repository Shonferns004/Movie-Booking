import { useEffect, useMemo, useRef, useState } from 'react';
import api from '../services/api.js';
import { loadYoupiScript } from '../services/youpi.js';

const rupees = (minor = 0) =>
  `₹${Number((Number(minor) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function BookingPayment({
  hold,
  context,
  selectedSeats,
  totalMinor,
  title,
  dateText,
  timeText,
  format,
  locality,
  onBack,
  onPaid,
}) {
  const account = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const [name, setName] = useState(account?.displayName || account?.name || '');
  const [email, setEmail] = useState(account?.email || '');
  const [mobile, setMobile] = useState(account?.mobile || account?.phone || '');
  const [booking, setBooking] = useState(null);
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const pollRef = useRef(null);

  const seats = selectedSeats.map((seat) => `${seat.row_label}-${seat.seat_number}`);
  const seatTotal = totalMinor || Number(hold?.totalMinor) || 0;

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  function startPolling(activeOrder, activeBooking) {
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
          try {
            await api.post('/payments/youpi/confirm', {
              orderId: activeOrder.orderId,
              utr: null,
              amountPaise: activeOrder.amountMinor,
            });
          } catch {
            // The webhook is authoritative.
          }
          localStorage.removeItem('currentHold');
          localStorage.removeItem('currentHoldContext');
          onPaid({ reference, booking: activeBooking });
          return;
        }
        if (state === 'FAILED' || state === 'EXPIRED') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setStatus('');
          setError(state === 'EXPIRED' ? 'The payment window expired. Please try again.' : 'The payment did not go through. Please try again.');
        }
      } catch {
        // Keep polling while the UPI app is open.
      }
      if (attempts >= 80) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }, 3500);
  }

  async function openPayment(activeOrder, activeBooking) {
    let checkoutUrl = activeOrder.checkoutUrl;
    try {
      if (checkoutUrl) {
        const url = new URL(checkoutUrl);
        url.searchParams.set('youpiParentOrigin', window.location.origin);
        checkoutUrl = url.toString();
      }
    } catch {
      // Keep the plain URL.
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
      theme: { color: '#C8FF1F' },
      customer: {
        name: name.trim() || undefined,
        email: email.trim() || undefined,
        phone: mobile.trim() || undefined,
      },
      onSuccess: () => {
        setStatus('Payment received. Confirming your ticket…');
        startPolling(activeOrder, activeBooking);
      },
      onFailed: (result) => {
        setError(result?.error || result?.reason || 'Payment failed. Please try again.');
        setStatus('');
        setLoading(false);
      },
      onCancelled: () => {
        setStatus('');
        setError('Payment cancelled. Your seats are still held for a few minutes.');
        setLoading(false);
      },
      onClose: () => setLoading(false),
    };

    const Youpi = await loadYoupiScript(activeOrder.scriptUrl, activeOrder.merchantKey, {
      apiUrl: activeOrder.apiUrl,
      portalUrl: activeOrder.portalUrl,
    });
    if (typeof Youpi?.pay === 'function') await Youpi.pay(options);
    else if (typeof Youpi?.open === 'function') Youpi.open(options);
    else throw new Error('Payment SDK did not initialise');
  }

  async function pay() {
    if (loading) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      if (booking && order) {
        setStatus('Reopening secure payment…');
        await openPayment(order, booking);
        setStatus('Complete the payment in the secure window.');
        startPolling(order, booking);
        setLoading(false);
        return;
      }

      setStatus('Reserving your booking…');
      const sessionRef = localStorage.getItem('sessionRef') || undefined;
      const bookingResponse = await api.post('/bookings', {
        holdId: hold.holdId,
        contactEmail: email.trim() || undefined,
        contactMobile: mobile.trim() || undefined,
        sessionRef,
      });
      const createdBooking = bookingResponse.data;
      setBooking(createdBooking);
      if (createdBooking.guestAccessToken) {
        sessionStorage.setItem(`bookingToken:${createdBooking.booking_reference}`, createdBooking.guestAccessToken);
      }

      setStatus('Starting secure payment…');
      const orderResponse = await api.post('/payments/youpi/orders', {
        bookingReference: createdBooking.booking_reference,
        sessionRef,
        customer: {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          mobile: mobile.trim() || undefined,
        },
      });
      const createdOrder = orderResponse.data;
      setOrder(createdOrder);

      setStatus('Opening the secure payment window…');
      await openPayment(createdOrder, createdBooking);
      setStatus('Complete the payment in the secure window.');
      startPolling(createdOrder, createdBooking);
      setLoading(false);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Unable to start payment.');
      setStatus('');
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
      <div className="lg:col-span-5 bg-[#B5AFA6] text-[#1E2227] rounded-[20px] p-6 space-y-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#2C3138]">Payment</p>
          <h2 className="mt-1 font-editorial text-2xl font-semibold leading-tight">{title}</h2>
          <p className="mt-1 text-xs text-[#2C3138]">{dateText} · {timeText} · {format}</p>
          <p className="mt-1 text-[11px] text-[#2C3138]">{locality}</p>
        </div>
        <div className="space-y-2 border-t border-[#1E2227]/15 pt-3 text-xs">
          <div className="flex justify-between gap-4">
            <span>Seats ({selectedSeats.length})</span>
            <span className="text-right font-mono font-semibold">{seats.join(', ') || 'None'}</span>
          </div>
          <div className="flex justify-between gap-4"><span>Tickets</span><span className="font-mono">{rupees(seatTotal)}</span></div>
          <div className="flex justify-between gap-4"><span>Booking fee</span><span className="font-mono">₹0</span></div>
          <div className="flex justify-between border-t border-[#1E2227]/15 pt-2 text-base font-bold"><span>Total Due</span><span className="font-mono">{rupees(seatTotal)}</span></div>
        </div>
        {hold?.expiresAt && (
          <p className="text-[10px] text-[#2C3138]">
            Seats held until {new Date(hold.expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        )}
      </div>

      <div className="lg:col-span-7 bg-[#252A30] rounded-[20px] p-6 sm:p-8 space-y-4">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8FF1F]">Contact details</p>
          <h3 className="mt-1 font-editorial text-2xl font-semibold text-[#F2F0EB]">Where should we send the pass?</h3>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="sm:col-span-2 w-full rounded-xl border border-[#B5AFA6]/25 bg-[#1E2227] px-4 py-3 text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/60" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address" className="w-full rounded-xl border border-[#B5AFA6]/25 bg-[#1E2227] px-4 py-3 text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/60" />
          <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" placeholder="Mobile number" className="w-full rounded-xl border border-[#B5AFA6]/25 bg-[#1E2227] px-4 py-3 font-mono text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/60" />
        </div>
        {status && <p className="text-xs text-[#C8FF1F]">{status}</p>}
        {error && <p className="text-xs text-[#F08A80]">{error}</p>}
        <div className="flex flex-col gap-3 pt-1 sm:flex-row">
          <button type="button" onClick={onBack} className="rounded-lg border border-[#B5AFA6]/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#B5AFA6] transition-colors hover:border-[#C8FF1F] hover:text-[#C8FF1F]">
            Back to seats
          </button>
          <button type="button" onClick={pay} disabled={loading} className="flex-1 rounded-lg bg-[#C8FF1F] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1E2227] transition-colors hover:bg-[#B5AFA6] disabled:opacity-50">
            {loading ? 'Opening payment…' : `Pay ${rupees(seatTotal)} via YouPI`}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-[#B5AFA6]/70">
          Payment is handled by YouPI. Your seats remain held while you complete the UPI payment.
        </p>
      </div>
    </div>
  );
}
