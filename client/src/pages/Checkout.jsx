import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api.js';

let youpiScriptPromise = null;

function loadYoupiScript(scriptUrl, merchantKey, { apiUrl, portalUrl } = {}) {
  if (youpiScriptPromise) return youpiScriptPromise;
  youpiScriptPromise = new Promise((resolve, reject) => {
    if (window.Youpi) return resolve(window.Youpi);
    const s = document.createElement('script');
    s.src = scriptUrl;
    s.async = true;
    if (merchantKey) s.setAttribute('data-youpi-key', merchantKey);
    // The gateway is mounted under this server's own port, so the SDK has to be told
    // where the payment API and the checkout portal live.
    if (apiUrl) s.setAttribute('data-api-url', apiUrl);
    if (portalUrl) s.setAttribute('data-portal-url', portalUrl);
    s.setAttribute('data-currency', 'INR');
    s.onload = () => (window.Youpi ? resolve(window.Youpi) : reject(new Error('Youpi SDK unavailable')));
    s.onerror = () => reject(new Error('Failed to load Youpi SDK'));
    document.head.appendChild(s);
  });
  return youpiScriptPromise;
}

export default function Checkout() {
  const location = useLocation();
  const hold = location.state || JSON.parse(localStorage.getItem('currentHold') || 'null');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => { if (!hold) navigate('/'); }, [hold, navigate]);

  if (!hold) return <p className="p-8 text-on-surface">No active hold. Go back to seat selection.</p>;

  async function checkout() {
    setLoading(true);
    setError('');
    try {
      const b = await api.post('/bookings', {
        holdId: hold.holdId,
        contactEmail: email || undefined,
        contactMobile: mobile || undefined,
        sessionRef: localStorage.getItem('sessionRef') || undefined,
      });
      const booking = b.data;

      const orderRes = await api.post('/payments/youpi/orders', {
        bookingReference: booking.booking_reference,
        customer: { email: email || undefined, mobile: mobile || undefined },
      });
      const order = orderRes.data;

      const Youpi = await loadYoupiScript(order.scriptUrl, order.merchantKey, {
        apiUrl: order.apiUrl,
        portalUrl: order.portalUrl,
      });

      Youpi.pay({
        // The session already exists (the server created it), so hand the SDK the
        // checkout URL instead of letting it open a second session.
        checkoutUrl: order.checkoutUrl,
        order_id: order.orderId,
        amount: Number(order.amount),
        currency: order.currency,
        name: 'Konkani Samudai Cinema',
        description: `Booking ${booking.booking_reference}`,
        handler: async (response) => {
          if (response && response.status === 'SUCCESS') {
            setStatus('Payment received. Confirming your tickets...');
            try {
              await api.post('/payments/youpi/confirm', {
                orderId: order.orderId,
                utr: response.utr,
                amountPaise: order.amountMinor,
              });
            } catch (e) {
              // the webhook may already have confirmed it
              console.warn('client confirm failed, relying on webhook', e);
            }
            localStorage.removeItem('currentHold');
            navigate(`/booking/${booking.booking_reference}`);
          } else {
            setStatus('Payment was not completed. You can retry from the booking page.');
            setLoading(false);
          }
        },
        onClose: () => {
          setStatus('Payment window closed.');
          setLoading(false);
        },
      });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-on-surface px-4 py-10">
      <div className="max-w-md mx-auto bg-surface-container rounded-2xl p-6 shadow-2xl">
        <h1 className="font-headline-md text-headline-md font-semibold mb-1">Checkout</h1>
        <p className="text-sm text-on-surface-variant mb-4">
          Seats: {hold.seatCount} • Total: Rs.{(hold.totalMinor / 100).toFixed(2)} {hold.currency}
        </p>
        <p className="text-xs text-on-surface-variant mb-6">Hold expires: {new Date(hold.expiresAt).toLocaleString()}</p>

        <label className="block text-xs text-on-surface-variant mb-1">Email</label>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full mb-4 bg-surface-container-low border border-surface-container-highest rounded-lg px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />

        <label className="block text-xs text-on-surface-variant mb-1">Mobile</label>
        <input
          value={mobile}
          onChange={(e) => setMobile(e.target.value)}
          placeholder="9876543210"
          className="w-full mb-6 bg-surface-container-low border border-surface-container-highest rounded-lg px-3 py-2 text-sm focus:border-primary focus:outline-none"
        />

        <button
          onClick={checkout}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary-container hover:bg-primary text-on-primary-container font-label-lg text-label-lg font-bold shadow-[0_0_24px_rgba(129,140,248,0.45)] active:scale-[0.98] transition-all disabled:opacity-60"
        >
          {loading ? 'Opening secure payment...' : `Pay Rs.${(hold.totalMinor / 100).toFixed(2)}`}
        </button>

        {status && <p className="mt-4 text-sm text-secondary text-center">{status}</p>}
        {error && <p className="mt-4 text-sm text-error text-center">{error}</p>}
      </div>
    </div>
  );
}
