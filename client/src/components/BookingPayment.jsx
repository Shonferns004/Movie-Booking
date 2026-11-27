import { useMemo, useState } from 'react';
import api from '../services/api.js';
import YoupiCheckout from './YoupiCheckout.jsx';

const rupees = (minor = 0) =>
  `₹${Number((Number(minor) || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export default function BookingPayment({
  hold,
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
  const [checkout, setCheckout] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const seats = selectedSeats.map((seat) => `${seat.row_label}-${seat.seat_number}`);
  const seatTotal = totalMinor || Number(hold?.totalMinor) || 0;

  async function pay() {
    if (loading) return;
    setLoading(true);
    setError('');
    setStatus('');
    try {
      let activeBooking = booking;
      let activeOrder = order;

      if (!activeBooking) {
        setStatus('Reserving your booking…');
        const sessionRef = localStorage.getItem('sessionRef') || undefined;
        const bookingResponse = await api.post('/bookings', {
          holdId: hold.holdId,
          contactEmail: email.trim() || undefined,
          contactMobile: mobile.trim() || undefined,
          sessionRef,
        });
        activeBooking = bookingResponse.data;
        setBooking(activeBooking);
        if (activeBooking.guestAccessToken) {
          sessionStorage.setItem(`bookingToken:${activeBooking.booking_reference}`, activeBooking.guestAccessToken);
        }
      }

      if (!activeOrder) {
        setStatus('Starting secure payment…');
        const sessionRef = localStorage.getItem('sessionRef') || undefined;
        const orderResponse = await api.post('/payments/youpi/orders', {
          bookingReference: activeBooking.booking_reference,
          sessionRef,
          customer: {
            name: name.trim() || undefined,
            email: email.trim() || undefined,
            mobile: mobile.trim() || undefined,
          },
        });
        activeOrder = orderResponse.data;
        setOrder(activeOrder);
      }

      setStatus('');
      setCheckout({ order: activeOrder, booking: activeBooking });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Unable to start payment.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  async function retryPayment() {
    if (!booking || loading) return;
    setCheckout(null);
    setLoading(true);
    setError('');
    setStatus('Starting secure payment…');
    try {
      const sessionRef = localStorage.getItem('sessionRef') || undefined;
      const response = await api.post('/payments/youpi/orders', {
        bookingReference: booking.booking_reference,
        sessionRef,
        customer: {
          name: name.trim() || undefined,
          email: email.trim() || undefined,
          mobile: mobile.trim() || undefined,
        },
      });
      setOrder(response.data);
      setStatus('');
      setCheckout({ order: response.data, booking });
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Unable to restart payment.');
      setStatus('');
    } finally {
      setLoading(false);
    }
  }

  async function handlePaid({ booking: paidBooking }) {
    const reference = paidBooking?.booking_reference || booking?.booking_reference;
    try {
      await api.post('/payments/youpi/confirm', {
        orderId: checkout?.order?.orderId,
        utr: null,
        amountPaise: checkout?.order?.amountMinor,
      });
    } catch {
      // The gateway webhook is authoritative.
    }
    localStorage.removeItem('currentHold');
    localStorage.removeItem('currentHoldContext');
    setCheckout(null);
    onPaid({ reference, booking: paidBooking || booking });
  }

  function handleCheckoutBack() {
    setCheckout(null);
    onBack?.();
  }

  return (
    <>
      <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        <div className="lg:col-span-5 bg-[#252A30] text-[#F2F0EB] rounded-[20px] p-6 space-y-4">
          <div>
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#C8FF1F]">Payment</p>
            <h2 className="mt-1 font-editorial text-2xl font-semibold leading-tight text-[#F2F0EB]">{title}</h2>
            <p className="mt-1 text-xs text-[#B5AFA6]">{dateText} · {timeText} · {format}</p>
            <p className="mt-1 text-[11px] text-[#B5AFA6]">{locality}</p>
          </div>
          <div className="space-y-2 border-t border-[#B5AFA6]/15 pt-3 text-xs text-[#B5AFA6]">
            <div className="flex justify-between gap-4">
              <span>Seats ({selectedSeats.length})</span>
              <span className="text-right font-mono font-semibold text-[#F2F0EB]">{seats.join(', ') || 'None'}</span>
            </div>
            <div className="flex justify-between gap-4"><span>Tickets</span><span className="font-mono text-[#F2F0EB]">{rupees(seatTotal)}</span></div>
            <div className="flex justify-between gap-4"><span>Booking fee</span><span className="font-mono text-[#F2F0EB]">₹0</span></div>
            <div className="flex justify-between border-t border-[#B5AFA6]/15 pt-2 text-base font-bold text-[#F2F0EB]"><span>Total Due</span><span className="font-mono text-[#C8FF1F]">{rupees(seatTotal)}</span></div>
          </div>
          {hold?.expiresAt && (
            <p className="text-[10px] text-[#B5AFA6]/80">
              Seats held until {new Date(hold.expiresAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          )}
          {status && <p className="text-xs text-[#C8FF1F]">{status}</p>}
          {error && <p className="text-xs text-[#F08A80]">{error}</p>}
          <div className="flex flex-col gap-3 pt-1 sm:flex-row">
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg border border-[#B5AFA6]/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#B5AFA6] transition-colors hover:border-[#C8FF1F] hover:text-[#C8FF1F]"
            >
              Back to seats
            </button>
            <button
              type="button"
              onClick={pay}
              disabled={loading}
              className="flex-1 rounded-lg bg-[#C8FF1F] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1E2227] transition-colors hover:bg-[#B5AFA6] disabled:opacity-50"
            >
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1E2227]/25 border-t-[#1E2227]" aria-hidden="true" />
                  Opening payment…
                </span>
              ) : (
                'Pay'
              )}
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#252A30] rounded-[20px] p-6 sm:p-8 space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="sm:col-span-2 w-full rounded-xl border border-[#B5AFA6]/25 bg-[#1E2227] px-4 py-3 text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/60" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address" className="w-full rounded-xl border border-[#B5AFA6]/25 bg-[#1E2227] px-4 py-3 text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/60" />
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} type="tel" placeholder="Mobile number" className="w-full rounded-xl border border-[#B5AFA6]/25 bg-[#1E2227] px-4 py-3 font-mono text-sm text-[#F2F0EB] outline-none placeholder:text-[#B5AFA6]/60" />
          </div>
        </div>
      </div>

      {checkout && (
        <YoupiCheckout
          order={checkout.order}
          booking={checkout.booking}
          payerName={name}
          payerMobile={mobile}
          seatCount={selectedSeats.length}
          onSuccess={handlePaid}
          onRetry={retryPayment}
          onBack={handleCheckoutBack}
        />
      )}
    </>
  );
}
