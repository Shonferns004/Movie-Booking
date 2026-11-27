import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../services/api.js';
import { useSileoNotice } from '../hooks/useSileoNotice.js';
import { useModalMotion } from '../hooks/useMotion.js';
import { openYoupiCheckout } from '../services/youpi.js';
import UiIcon from '../components/UiIcon.jsx';

const WHATSAPP = '917506419340';
const rupees = (value) => `₹${Number(value).toLocaleString('en-IN')}`;
function TicketModal({ event, onClose }) {
  const navigate = useNavigate();
  const account = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);
  const accountName = String(account?.displayName || account?.name || '').trim();
  const accountPhone = String(account?.mobile || account?.phone || '').trim();
  const accountEmail = String(account?.email || '').trim();
  const loggedIn = Boolean(localStorage.getItem('token'));

  const [tierId, setTierId] = useState(event.tiers[0].id);
  const [quantity, setQuantity] = useState(1);
  const [name, setName] = useState(accountName);
  const [phone, setPhone] = useState(accountPhone);
  const [editDetails, setEditDetails] = useState(!loggedIn || !accountName || !accountPhone);
  const [order, setOrder] = useState(null);
  const [stage, setStage] = useState('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useSileoNotice(error, 'error', { title: 'Payment' });
  useSileoNotice(notice, 'info');
  const pollRef = useRef(null);

  const tier = useMemo(
    () => event.tiers.find((item) => item.id === tierId) || event.tiers[0],
    [event, tierId],
  );
  const total = tier.price * quantity;
  const waiting = stage === 'waiting';
  const offsetMinor = order ? Math.max(0, Number(order.amountMinor) - Number(order.baseAmountMinor)) : 0;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const finish = useCallback(
    async (orderId) => {
      stopPolling();
      try {
        // The gateway is the authority; the webhook can still settle this later.
        await api.post(`/community/events/checkout/${orderId}/confirm`, {});
      } catch {
        /* keep the paid state: status polling already saw SUCCESS */
      }
      setStage('paid');
      navigate(`/event-ticket/${orderId}`);
    },
    [navigate, stopPolling],
  );

  const startPolling = useCallback(
    (activeOrder) => {
      stopPolling();
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const response = await api.get(`/community/events/checkout/${activeOrder.orderId}`);
          const status = String(response.data?.status || '');
          const providerStatus = String(response.data?.providerStatus || '');
          if (status === 'paid' || providerStatus === 'SUCCESS') {
            await finish(activeOrder.orderId);
            return;
          }
          if (status === 'failed' || status === 'expired' || providerStatus === 'FAILED' || providerStatus === 'EXPIRED') {
            stopPolling();
            setStage('form');
            setError('The payment did not go through. Please try again.');
          }
        } catch {
          // Transient errors are expected while the UPI app is open.
        }
        if (attempts >= 60) stopPolling();
      }, 3500);
    },
    [finish, stopPolling],
  );

  function paymentOptions(activeOrder, overrides = {}) {
    return {
      name: name.trim() || accountName,
      phone: phone.trim() || accountPhone,
      email: accountEmail,
      description: `${event.title} · ${activeOrder.tierName} × ${activeOrder.quantity}`,
      onSuccess: () => finish(activeOrder.orderId),
      onFailed: (result) => {
        stopPolling();
        setStage('form');
        setError(result?.error || result?.reason || 'Payment failed. Please try again.');
      },
      onCancelled: () => {
        setNotice('Payment window closed. You can reopen it with the button below.');
      },
      ...overrides,
    };
  }

  async function pay() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const response = await api.post(`/community/events/${event.id}/checkout`, {
        tierId: tier.id,
        quantity,
        name: name.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      const created = response.data;
      setOrder(created);
      startPolling(created);
      const mode = await openYoupiCheckout(created, paymentOptions(created));
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      stopPolling();
      setStage('form');
      setError(e?.response?.data?.error || e?.message || 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!order || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const mode = await openYoupiCheckout(order, paymentOptions(order));
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      setError(e?.message || 'Could not reopen the payment window.');
    } finally {
      setBusy(false);
    }
  }

  function resetOrder() {
    setOrder(null);
    setStage('form');
    setError('');
    setNotice('');
    stopPolling();
  }

  const whatsappLink = useMemo(() => {
    const lines = [
      `Event: ${event.title}`,
      `Pass: ${order?.tierName || tier.name}`,
      `Quantity: ${order?.quantity || quantity}`,
      `Paid: ₹${order?.amount || total}`,
      order?.orderId ? `Order: ${order.orderId}` : null,
      name.trim() ? `Name: ${name.trim()}` : null,
    ].filter(Boolean);
    return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(lines.join('\n'))}`;
  }, [event, tier, quantity, total, name, order]);

  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  useModalMotion(panelRef, backdropRef);

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#14181B]/85 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${event.title} tickets`}
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="modal-in max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-[26px] border border-[#F2F0EC]/12 bg-[#242A30] p-6 shadow-2xl sm:rounded-[26px]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: event.accent }}>
              {event.date}
            </p>
            <h3 className="mt-1.5 font-['Playfair Display',Georgia,serif] text-[26px] font-bold leading-[1.02] tracking-[-0.02em]">
              {event.title}
            </h3>
            <p className="mt-1.5 text-[11px] text-[#F2F0EC]/50">{event.venue}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#F2F0EC]/15 p-2 text-[#F2F0EC]/60 transition-colors hover:text-[#F2F0EC]"
            aria-label="Close"
          >
            <UiIcon name="close" className="text-[18px]" />
          </button>
        </div>

        {stage === 'paid' ? (
          <div className="mt-8 text-center">
            <UiIcon name="check_circle" className="text-[46px] text-[#B6E36A]" />
            <h4 className="mt-3 font-['Playfair Display',Georgia,serif] text-[24px] font-bold">You're in.</h4>
            <p className="mt-2 text-[12px] leading-relaxed text-[#F2F0EC]/65">
              {order?.quantity || quantity} × {order?.tierName || tier.name} · {event.title}
            </p>
            <p className="mt-1 font-['Playfair Display',Georgia,serif] text-[22px] font-bold text-[#C8FF1F]">
              ₹{order?.amount || total}
            </p>
            {order?.orderId && (
              <p className="mt-2 font-mono text-[10px] text-[#F2F0EC]/40">Order {order.orderId}</p>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-[#F2F0EC]/40">
              Show this order at the counter. Send the committee a copy on WhatsApp and they will
              keep your passes ready.
            </p>
            {order?.orderId && (
              <Link
                to={`/event-ticket/${order.orderId}`}
                onClick={onClose}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#C8FF1F] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#1A1E23]"
              >
                <UiIcon name="confirmation_number" className="text-[15px]" />
                View your ticket
              </Link>
            )}
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-[#B6E36A] px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#1A1E23]"
            >
              <UiIcon name="chat" className="text-[15px]" />
              Send details
            </a>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 block w-full rounded-full border border-[#F2F0EC]/18 py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F2F0EC]/70"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mt-5 space-y-2">
              {event.tiers.map((option) => {
                const selected = option.id === tierId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      if (option.id !== tierId) {
                        setTierId(option.id);
                        resetOrder();
                      }
                    }}
                    className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                      selected
                        ? 'border-[#C8FF1F]/70 bg-[#C8FF1F]/[0.09]'
                        : 'border-[#F2F0EC]/10 bg-[#1A1E23]/40 hover:border-[#F2F0EC]/25'
                    }`}
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#F2F0EC]">{option.name}</span>
                      {option.note && <span className="block text-[10px] text-[#F2F0EC]/45">{option.note}</span>}
                    </span>
                    <span className="font-['Playfair Display',Georgia,serif] text-lg font-bold text-[#C8FF1F]">
                      {rupees(option.price)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between rounded-xl border border-[#F2F0EC]/10 bg-[#1A1E23]/40 px-4 py-2.5">
              <span className="text-[11px] uppercase tracking-[0.12em] text-[#F2F0EC]/50">Passes</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setQuantity((value) => Math.max(1, value - 1));
                    resetOrder();
                  }}
                  className="h-7 w-7 rounded-full border border-[#F2F0EC]/20 text-base leading-none text-[#F2F0EC]/80 hover:border-[#C8FF1F]"
                  aria-label="Fewer passes"
                >
                  −
                </button>
                <span className="w-5 text-center text-[13px] font-bold">{quantity}</span>
                <button
                  type="button"
                  onClick={() => {
                    setQuantity((value) => Math.min(10, value + 1));
                    resetOrder();
                  }}
                  className="h-7 w-7 rounded-full border border-[#F2F0EC]/20 text-base leading-none text-[#F2F0EC]/80 hover:border-[#C8FF1F]"
                  aria-label="More passes"
                >
                  +
                </button>
              </div>
            </div>

            {loggedIn && !editDetails ? (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#F2F0EC]/10 bg-[#1A1E23]/40 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#F2F0EC]/40">Paying as</p>
                  <p className="truncate text-[12px] font-semibold text-[#F2F0EC]">
                    {name}
                    {phone ? ` · ${phone}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditDetails(true)}
                  className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em] text-[#C8FF1F]"
                >
                  Edit
                </button>
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <input
                  value={name}
                  onChange={(changeEvent) => setName(changeEvent.target.value)}
                  placeholder="Name (for the pass)"
                  className="w-full rounded-xl border border-[#F2F0EC]/12 bg-[#1A1E23]/60 px-3 py-2.5 text-[11px] text-[#F2F0EC] outline-none placeholder:text-[#F2F0EC]/25 focus:border-[#C8FF1F]"
                />
                <input
                  value={phone}
                  onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                  inputMode="tel"
                  placeholder="Mobile number (for the pass)"
                  className="w-full rounded-xl border border-[#F2F0EC]/12 bg-[#1A1E23]/60 px-3 py-2.5 text-[11px] text-[#F2F0EC] outline-none placeholder:text-[#F2F0EC]/25 focus:border-[#C8FF1F]"
                />
              </div>
            )}

            <div className="mt-4 rounded-[18px] border border-[#F2F0EC]/10 bg-[#171B1F] p-4">
              <div className="flex items-center justify-between text-[11px] text-[#F2F0EC]/60">
                <span>Passes</span>
                <span>{quantity} × {rupees(tier.price)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[#F2F0EC]/60">
                <span>Ticket total</span>
                <span>{rupees(total)}</span>
              </div>
              {offsetMinor > 0 && (
                <div className="mt-1 flex items-center justify-between text-[10px] text-[#F2F0EC]/40">
                  <span>Payment verification</span>
                  <span>+ ₹{(offsetMinor / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between border-t border-[#F2F0EC]/10 pt-2">
                <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#F2F0EC]/45">
                  Payable
                </span>
                <span className="font-['Playfair Display',Georgia,serif] text-[24px] font-bold text-[#C8FF1F]">
                  ₹{order ? order.amount : total}
                </span>
              </div>
              {order && offsetMinor > 0 && (
                <p className="mt-2 text-[9px] leading-relaxed text-[#F2F0EC]/35">
                  A small verification amount identifies your transfer. It is part of the total
                  and goes to the Samudai.
                </p>
              )}
            </div>

            {notice && <p className="mt-3 text-center text-[11px] text-[#C8FF1F]/85">{notice}</p>}
            {error && <p className="mt-3 text-center text-[11px] text-[#F08A80]">{error}</p>}

            {order ? (
              <button
                type="button"
                onClick={reopen}
                disabled={busy || waiting}
                className="mt-4 w-full rounded-full border border-[#C8FF1F]/45 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C8FF1F] transition-colors hover:bg-[#C8FF1F] hover:text-[#1A1E23] disabled:opacity-60"
              >
                {busy ? 'Opening…' : waiting ? 'Waiting for payment…' : 'Reopen secure payment'}
              </button>
            ) : (
              <button
                type="button"
                onClick={pay}
                disabled={busy}
                className="mt-4 w-full rounded-full bg-[#C8FF1F] py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#1E2227] disabled:opacity-60"
              >
                {busy ? 'Opening secure payment…' : `Pay ${rupees(total)} with YouPI`}
              </button>
            )}

            <p className="mt-2 text-center text-[9px] text-[#F2F0EC]/35">
              Secure UPI checkout · YouPI · passes also at the counter
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------- membership modal */

function MembershipModal({ onClose, plan: initialPlan, onMemberChange }) {
  const backdropRef = useRef(null);
  const panelRef = useRef(null);
  useModalMotion(panelRef, backdropRef);
  const token = localStorage.getItem('token');
  const account = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('user') || 'null');
    } catch {
      return null;
    }
  }, []);

  const [plan, setPlan] = useState(initialPlan || { label: 'Annual membership', amountMinor: 120000 });
  const [name, setName] = useState(String(account?.displayName || account?.name || ''));
  const [phone, setPhone] = useState(String(account?.mobile || account?.phone || ''));
  const [gender, setGender] = useState('');
  const [dob, setDob] = useState('');
  const [age, setAge] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const email = String(account?.email || '');
  const [member, setMember] = useState(null);
  const [stage, setStage] = useState('form');
  const [order, setOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useSileoNotice(error, 'error', { title: 'Payment' });
  useSileoNotice(notice, 'info');
  const pollRef = useRef(null);

  const waiting = stage === 'waiting';
  const total = Math.round((plan?.amountMinor ?? 120000) / 100);

  const applyMember = useCallback(
    (next) => {
      setMember(next);
      onMemberChange?.(next);
    },
    [onMemberChange],
  );

  useEffect(() => {
    if (!token) return;
    api
      .get('/community/membership')
      .then((response) => {
        if (response.data?.plan) setPlan(response.data.plan);
        if (response.data?.member) applyMember(response.data.member);
      })
      .catch(() => {});
  }, [token]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const finish = useCallback(
    async (orderId) => {
      stopPolling();
      try {
        const response = await api.post(`/community/membership/checkout/${orderId}/confirm`, {});
        if (response.data?.member) applyMember(response.data.member);
      } catch {
        // The gateway status is authoritative; the webhook can still settle this.
      }
      setStage('paid');
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (orderId) => {
      stopPolling();
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const response = await api.get(`/community/membership/checkout/${orderId}`);
          const status = String(response.data?.status || '');
          if (status === 'paid') {
            if (response.data?.member) applyMember(response.data.member);
            stopPolling();
            setStage('paid');
            return;
          }
          if (status === 'failed' || status === 'expired') {
            stopPolling();
            setStage('form');
            setError('The payment did not go through. Please try again.');
          }
        } catch {
          // Keep polling while the UPI app is open.
        }
        if (attempts >= 60) stopPolling();
      }, 3500);
    },
    [stopPolling],
  );

  function handleDob(value) {
    setDob(value);
    if (!value) return;
    const birth = new Date(value);
    if (Number.isNaN(birth.getTime())) return;
    const years = Math.floor((Date.now() - birth.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (years >= 0 && years < 120) setAge(String(years));
  }

  async function pay() {
    if (busy) return;
    if (!name.trim()) {
      setError('Enter your full name.');
      return;
    }
    if (!/^[0-9+\s-]{8,16}$/.test(phone.trim())) {
      setError('Enter a valid contact number.');
      return;
    }
    if (!gender) {
      setError('Select your gender.');
      return;
    }
    if (!dob) {
      setError('Enter your date of birth.');
      return;
    }
    if (!maritalStatus) {
      setError('Select your marital status.');
      return;
    }

    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const response = await api.post('/community/membership/checkout', {
        name: name.trim(),
        phone: phone.trim(),
        gender,
        age: age ? Number(age) : undefined,
        dob,
        maritalStatus,
      });
      const created = response.data;
      setOrder(created);
      startPolling(created.orderId);

      const mode = await openYoupiCheckout(created, {
        name: name.trim(),
        phone: phone.trim(),
        email,
        description: `Konkani Samudai membership · ${name.trim()}`,
        onSuccess: () => finish(created.orderId),
        onFailed: (result) => {
          stopPolling();
          setStage('form');
          setError(result?.error || result?.reason || 'Payment failed. Please try again.');
        },
        onCancelled: () => setNotice('Payment window closed. You can reopen it below.'),
      });
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      stopPolling();
      setStage('form');
      setError(e?.response?.data?.error || e?.message || 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  }

  async function reopen() {
    if (!order || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    setStage('waiting');
    try {
      const mode = await openYoupiCheckout(order, {
        name: name.trim(),
        phone: phone.trim(),
        email,
        description: `Konkani Samudai membership · ${name.trim()}`,
        onSuccess: () => finish(order.orderId),
        onFailed: (result) => {
          stopPolling();
          setStage('form');
          setError(result?.error || result?.reason || 'Payment failed. Please try again.');
        },
        onCancelled: () => setNotice('Payment window closed. You can reopen it below.'),
      });
      if (mode === 'tab') {
        setNotice('Complete the payment in the new tab — this window updates automatically.');
      }
    } catch (e) {
      setError(e?.message || 'Could not reopen the payment window.');
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    'w-full rounded-xl border border-[#F2F0EC]/12 bg-[#1A1E23]/70 px-3.5 py-2.5 text-[12px] text-[#F2F0EC] outline-none transition-colors placeholder:text-[#F2F0EC]/25 focus:border-[#F2F0EC]/20 focus:outline-none focus:ring-0 focus-visible:outline-none';
  const labelClass = 'mb-1.5 block text-[8px] font-bold uppercase tracking-[0.18em] text-[#F2F0EC]/45';

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#14181B]/85 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Become a member"
      onClick={(clickEvent) => {
        if (clickEvent.target === clickEvent.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="modal-in max-h-[93vh] w-full max-w-[700px] overflow-y-auto rounded-t-[26px] border border-[#F2F0EC]/12 bg-[#242A30] shadow-2xl sm:rounded-[26px]">
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.24em] text-[#C8FF1F]">Membership</p>
              <h3 className="mt-1.5 font-['Playfair Display',Georgia,serif] text-[26px] font-bold leading-[1.02] tracking-[-0.02em]">
                {stage === 'paid' || member ? 'Your membership' : 'Join Konkani Samudai'}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#F2F0EC]/15 p-2 text-[#F2F0EC]/60 transition-colors hover:text-[#F2F0EC]"
              aria-label="Close"
            >
              <UiIcon name="close" className="text-[18px]" />
            </button>
          </div>

          {!token ? (
            <div className="mt-8 text-center">
              <UiIcon name="lock" className="mx-auto text-[38px] text-[#C8FF1F]/70" />
              <p className="mt-3 text-[13px] leading-relaxed text-[#F2F0EC]/65">
                You need an account before you can become a member. It takes a minute.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#C8FF1F] px-6 py-3 text-[12px] font-bold uppercase tracking-[0.12em] text-[#1E2227]"
              >
                Sign in to continue
                <UiIcon name="arrow_forward" className="text-[16px]" />
              </Link>
              <p className="mt-3 text-[10px] text-[#F2F0EC]/35">
                New here? The sign-in page also creates an account.
              </p>
            </div>
          ) : stage === 'paid' || member ? (
            <div className="mt-8 text-center">
              <UiIcon name="verified" className="mx-auto text-[44px] text-[#C8FF1F]" />
              <h4 className="mt-3 font-['Playfair Display',Georgia,serif] text-[24px] font-bold">You're a member</h4>
              <p className="mt-2 text-[12px] leading-relaxed text-[#F2F0EC]/65">
                {member?.name || name} · {rupees(Math.round(Number(member?.amountMinor || plan.amountMinor) / 100))} a year
              </p>
              <p className="mt-1 text-[11px] text-[#F2F0EC]/45">
                Status <span className="font-semibold capitalize text-[#C8FF1F]">{member?.status || 'active'}</span>
              </p>
              <p className="mt-3 text-[10px] leading-relaxed text-[#F2F0EC]/40">
                Your membership is active. Show your account at the counter for member rates on events
                and priority seats.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 w-full rounded-full bg-[#C8FF1F] py-3 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1E2227] transition-colors hover:bg-[#B5AFA6]"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="mt-5 rounded-2xl border border-[#C8FF1F]/30 bg-gradient-to-r from-[#C8FF1F]/[0.14] to-[#C8FF1F]/[0.07] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[#C8FF1F]">
                      {plan?.label || 'Annual membership'}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[#F2F0EC]/50">One plan · renews yearly</p>
                  </div>
                  <p className="font-['Playfair Display',Georgia,serif] text-[30px] font-bold leading-none text-[#C8FF1F]">
                    {rupees(total)}
                    <span className="ml-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#F2F0EC]/40">/ yr</span>
                  </p>
                </div>
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#F2F0EC]/55">
                  <li>✦ Member rates</li>
                  <li>✦ Priority seats</li>
                  <li>✦ AGM voting</li>
                  <li>✦ Household card</li>
                </ul>
              </div>

              <p className="mt-5 text-[9px] font-bold uppercase tracking-[0.2em] text-[#F2F0EC]/40">
                Your details
              </p>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className={labelClass}>Full name</span>
                  <input
                    value={name}
                    onChange={(changeEvent) => setName(changeEvent.target.value)}
                    placeholder="Your name"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <span className={labelClass}>Contact number</span>
                  <input
                    value={phone}
                    onChange={(changeEvent) => setPhone(changeEvent.target.value)}
                    inputMode="tel"
                    placeholder="10-digit mobile number"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <span className={labelClass}>Gender</span>
                  <select
                    value={gender}
                    onChange={(changeEvent) => setGender(changeEvent.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Select</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>

                <div>
                  <span className={labelClass}>Marital status</span>
                  <select
                    value={maritalStatus}
                    onChange={(changeEvent) => setMaritalStatus(changeEvent.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Select</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="divorced">Divorced</option>
                    <option value="widowed">Widowed</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <span className={labelClass}>Date of birth</span>
                  <input
                    type="date"
                    value={dob}
                    onChange={(changeEvent) => handleDob(changeEvent.target.value)}
                    className={`${fieldClass} [color-scheme:dark]`}
                  />
                </div>

                <div>
                  <span className={labelClass}>Age</span>
                  <input
                    value={age}
                    onChange={(changeEvent) => setAge(changeEvent.target.value.replace(/[^0-9]/g, ''))}
                    inputMode="numeric"
                    placeholder="Auto"
                    className={fieldClass}
                  />
                </div>
              </div>

              {notice && <p className="mt-3 text-center text-[11px] text-[#C8FF1F]/85">{notice}</p>}
              {error && <p className="mt-3 text-center text-[11px] text-[#F08A80]">{error}</p>}

              {order ? (
                <button
                  type="button"
                  onClick={reopen}
                  disabled={busy || waiting}
                  className="mt-5 w-full rounded-full border border-[#C8FF1F]/45 py-3.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#C8FF1F] transition-colors hover:bg-[#C8FF1F] hover:text-[#1A1E23] disabled:opacity-60"
                >
                  {busy ? 'Opening…' : waiting ? 'Waiting for payment…' : 'Reopen secure payment'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pay}
                  disabled={busy}
                  className="mt-5 w-full rounded-full bg-[#C8FF1F] py-3.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[#1E2227] shadow-[0_18px_40px_-20px_rgba(200,255,31,0.9)] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
                >
                  {busy ? 'Opening secure payment…' : `Pay ${rupees(total)}`}
                </button>
              )}

              <p className="mt-2.5 text-center text-[9px] text-[#F2F0EC]/35">
                Secure UPI checkout · your membership activates automatically
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export { TicketModal, MembershipModal };
