import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import api from '../services/api.js';
import { useSileoNotice } from '../hooks/useSileoNotice.js';
import EventTicketArtwork from '../components/EventTicketArtwork.jsx';
import UiIcon from '../components/UiIcon.jsx';

const WHATSAPP = '917506419340';

export default function EventTicket() {
  const { orderId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [status, setStatus] = useState('');
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useSileoNotice(error, 'error', { title: 'Event pass' });
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    let stop = false;
    api
      .get('/community')
      .then((response) => {
        if (!stop) setBackgroundUrl(response.data?.eventTicket?.backgroundUrl || '');
      })
      .catch(() => {});
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    let stop = false;
    let timer;

    const load = async () => {
      try {
        const response = await api.get(`/community/events/checkout/${orderId}`);
        if (stop) return;
        setTicket(response.data?.order || null);
        setStatus(String(response.data?.status || ''));
        setError('');
        setLoading(false);
        if (response.data?.providerStatus === 'SUCCESS' && response.data?.status !== 'paid') {
          // The public read is read-only; settle the paid state through the
          // amount-checked confirmation route, then reload.
          await api.post(`/community/events/checkout/${orderId}/confirm`, {}).catch(() => {});
          if (!stop) timer = setTimeout(load, 800);
          return;
        }
        if (response.data?.status !== 'paid') {
          timer = setTimeout(load, 3500);
        }
      } catch (e) {
        if (stop) return;
        setError(e?.response?.data?.error || 'We could not find this ticket.');
        setLoading(false);
      }
    };

    load();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [orderId]);

  useEffect(() => {
    if (!printing) return undefined;
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);
    const timer = setTimeout(() => window.print(), 150);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
    };
  }, [printing]);

  const paid = status === 'paid';
  const whatsappLink = ticket
    ? `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
        `Event ticket: ${ticket.eventTitle}\nOrder: ${ticket.orderId}\n${ticket.quantity} × ${ticket.tierName}`,
      )}`
    : '#';

  return (
    <main className="min-h-screen bg-[#1A1E23] px-4 pb-20 pt-10 text-[#F2F0EC] sm:px-6">
      <style>{CSS}</style>

      <div className="mx-auto max-w-[1000px]">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="flex items-center gap-3 text-[9px] font-bold uppercase tracking-[0.3em] text-[#C8FF1F]">
              <span className="h-px w-8 bg-[#C8FF1F]/60" />
              Your ticket
            </p>
            <h1 className="mt-3 font-['Tempting',Georgia,serif] text-[32px] font-bold leading-none tracking-[-0.03em] sm:text-[42px]">
              Event pass
            </h1>
          </div>
          <Link
            to="/"
            className="rounded-full border border-[#F2F0EC]/20 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#F2F0EC]/70 transition-colors hover:border-[#C8FF1F] hover:text-[#C8FF1F]"
          >
            Back to community
          </Link>
        </header>

        {loading && (
          <div className="border border-[#F2F0EC]/10 bg-[#242A30]/70 p-10 text-center text-[12px] text-[#F2F0EC]/55">
            Loading your ticket…
          </div>
        )}

        {!loading && error && (
          <div className="border border-[#F08A80]/30 bg-[#F08A80]/10 p-10 text-center">
            <p className="text-[13px] text-[#F2F0EC]/70">{error}</p>
            <Link
              to="/"
              className="btn mt-4"
            >
              Back to community
            </Link>
          </div>
        )}

        {!loading && !error && !paid && (
          <div className="border border-[#C8FF1F]/25 bg-[#242A30]/70 p-10 text-center">
            <UiIcon name="hourglass_top" className="text-[36px] text-[#C8FF1F]/70" />
            <h2 className="mt-3 font-['Tempting',Georgia,serif] text-[24px] font-bold">Confirming your payment</h2>
            <p className="mx-auto mt-2 max-w-md text-[12px] leading-relaxed text-[#F2F0EC]/55">
              This page refreshes automatically as soon as the committee’s gateway confirms the
              payment.
            </p>
          </div>
        )}

        {!loading && !error && paid && ticket && (
          <>
            <EventTicketArtwork ticket={ticket} backgroundUrl={backgroundUrl} />

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPrinting(true)}
                className="btn"
              >
                <UiIcon name="download" className="text-[16px]" />
                Download PDF
              </button>
              <a
                href={whatsappLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 bg-[#B6E36A] px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1A1E23] transition-transform hover:-translate-y-0.5"
              >
                <UiIcon name="chat" className="text-[16px]" />
                Send details
              </a>
              <span className="ml-auto font-mono text-[10px] text-[#F2F0EC]/40">Order {ticket.orderId}</span>
            </div>

            <p className="mt-4 text-[10px] leading-relaxed text-[#F2F0EC]/40">
              Show this pass at the counter. The QR encodes your order id for the committee.
            </p>
          </>
        )}
      </div>

      {printing && ticket && (
        <div className="kk-print-ticket">
          <EventTicketArtwork ticket={ticket} backgroundUrl={backgroundUrl} />
        </div>
      )}
    </main>
  );
}

const CSS = `
.kk-print-ticket { display: none; }
@media print {
  body { background: #fff !important; }
  body * { visibility: hidden; }
  .kk-print-ticket, .kk-print-ticket * { visibility: visible; }
  .kk-print-ticket {
    display: block;
    position: fixed;
    inset: 0;
    padding: 12mm;
    background: #fff;
    --kk-ticket-bg: #fff;
  }
  .kk-print-ticket .event-ticket {
    box-shadow: none;
    print-color-adjust: exact;
    -webkit-print-color-adjust: exact;
  }
  @page { size: A4 landscape; margin: 0; }
}
`;
