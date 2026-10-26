import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import api from '../services/api.js';

const money = (minor = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currency || 'INR',
    minimumFractionDigits: 2,
  }).format(Number(minor || 0) / 100);

function statusStyles(status = '') {
  const value = status.toLowerCase();
  if (['confirmed', 'success', 'paid', 'active', 'issued'].includes(value)) {
    return { label: status, dot: 'bg-emerald-400', panel: 'border-emerald-400/25 bg-emerald-400/10', text: 'text-emerald-300' };
  }
  if (['pending', 'processing', 'created'].includes(value)) {
    return { label: status, dot: 'bg-[#F4B63F] animate-pulse', panel: 'border-[#F4B63F]/25 bg-[#F4B63F]/10', text: 'text-[#F4B63F]' };
  }
  return { label: status || 'Unknown', dot: 'bg-[#C2305E]', panel: 'border-[#C2305E]/30 bg-[#C2305E]/10', text: 'text-[#F08BA8]' };
}

export default function BookingConfirmation() {
  const { reference } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let stopped = false;
    let intervalId;

    const loadBooking = async () => {
      try {
        setRefreshing(true);
        const response = await api.get(`/bookings/${reference}`);
        if (!stopped) {
          setBooking(response.data);
          setError('');
        }
      } catch (err) {
        if (!stopped) setError(err.response?.data?.error || 'We could not load this booking. Please try again.');
      } finally {
        if (!stopped) setRefreshing(false);
      }
    };

    loadBooking();
    if (!booking || booking.status?.toLowerCase() === 'pending') {
      intervalId = setInterval(loadBooking, 2500);
    }

    return () => {
      stopped = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [reference, booking?.status]);

  if (!booking && !error) {
    return (
      <main className="min-h-screen bg-[#0A2A31] px-4 py-16 text-[#EFEBE0]">
        <div className="mx-auto flex max-w-md flex-col items-center rounded-3xl border border-[#EFEBE0]/10 bg-[#123E47] p-8 text-center shadow-2xl">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-[#F4B63F]/30 bg-[#F4B63F]/10">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#F4B63F]/25 border-t-[#F4B63F]" />
          </div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#F4B63F]">Konkani Samudai</p>
          <h1 className="mt-3 font-serif text-3xl">Preparing your tickets</h1>
          <p className="mt-3 text-sm leading-6 text-[#EFEBE0]/65">We’re checking your booking details. This should only take a moment.</p>
        </div>
      </main>
    );
  }

  if (error && !booking) {
    return (
      <main className="min-h-screen bg-[#0A2A31] px-4 py-16 text-[#EFEBE0]">
        <div className="mx-auto max-w-md rounded-3xl border border-[#C2305E]/30 bg-[#123E47] p-8 text-center shadow-2xl">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#C2305E]/15 text-2xl text-[#F08BA8]">!</div>
          <h1 className="mt-4 font-serif text-2xl">Booking unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-[#EFEBE0]/65">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-6 rounded-xl bg-[#C2305E] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d34470]">Try again</button>
          <div><Link to="/" className="mt-4 inline-block text-sm text-[#F4B63F] hover:underline">Back to movies</Link></div>
        </div>
      </main>
    );
  }

  const bookingStatus = statusStyles(booking.status);
  const isPending = booking.status?.toLowerCase() === 'pending';
  const tickets = booking.tickets || [];

  return (
    <main className="min-h-screen overflow-hidden bg-[#0A2A31] px-4 py-8 text-[#EFEBE0] sm:px-6 sm:py-12">
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgba(194,48,94,0.14),transparent_65%)]" />
      <div className="relative mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3 group">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#123E47] text-[#F4B63F] transition group-hover:bg-[#194e58]">✦</span>
            <span>
              <span className="block text-sm font-extrabold tracking-[0.14em]">KONKANI SAMUDAI</span>
              <span className="mt-0.5 block text-[10px] uppercase tracking-[0.2em] text-[#EFEBE0]/45">Your cinema, your community</span>
            </span>
          </Link>
          <Link to="/" className="rounded-full border border-[#EFEBE0]/15 px-4 py-2 text-xs font-semibold text-[#EFEBE0]/75 transition hover:border-[#F4B63F]/50 hover:text-[#F4B63F]">Back to movies</Link>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-[#EFEBE0]/10 bg-[#123E47] shadow-[0_24px_80px_rgba(0,0,0,0.24)]">
          <div className="relative border-b border-dashed border-[#EFEBE0]/15 px-6 py-8 sm:px-10 sm:py-10">
            <div className="absolute right-0 top-0 h-48 w-48 rounded-full bg-[#C2305E]/10 blur-3xl" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#F4B63F]">Booking details</p>
                <h1 className="mt-3 font-serif text-3xl leading-tight sm:text-4xl">{isPending ? 'Your booking is processing' : 'Your movie night, secured.'}</h1>
                <p className="mt-3 max-w-xl text-sm leading-6 text-[#EFEBE0]/65">{isPending ? 'We’re waiting for the final payment confirmation. This page refreshes automatically.' : 'Keep your booking reference and ticket QR codes ready when you arrive at the cinema.'}</p>
              </div>
              <div className={`inline-flex w-fit shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold capitalize ${bookingStatus.panel} ${bookingStatus.text}`}>
                <span className={`h-2 w-2 rounded-full ${bookingStatus.dot}`} />
                {bookingStatus.label}
                {isPending && refreshing ? <span className="ml-1 text-[#EFEBE0]/50">· Checking</span> : null}
              </div>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#EFEBE0]/8 bg-[#0A2A31]/45 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/45">Booking reference</p>
                <p className="mt-2 break-all font-mono text-lg font-bold tracking-wide text-[#F4B63F]">{booking.booking_reference}</p>
              </div>
              <div className="rounded-2xl border border-[#EFEBE0]/8 bg-[#0A2A31]/45 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/45">Total paid / due</p>
                <p className="mt-2 text-2xl font-bold">{money(booking.total_minor, booking.currency)}</p>
                <p className="mt-1 text-xs text-[#EFEBE0]/45">{booking.currency || 'INR'} · {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}</p>
              </div>
            </div>
          </div>

          <div className="px-6 py-7 sm:px-10 sm:py-9">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#F4B63F]">Admission passes</p>
                <h2 className="mt-2 font-serif text-2xl">Your tickets <span className="font-sans text-base text-[#EFEBE0]/40">({tickets.length})</span></h2>
              </div>
              <p className="text-xs text-[#EFEBE0]/45">Present each QR code at entry</p>
            </div>

            {tickets.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {tickets.map((ticket, index) => {
                  const ticketStatus = statusStyles(ticket.status);
                  return (
                    <article key={ticket.id || ticket.ticket_reference} className="group relative overflow-hidden rounded-2xl border border-[#EFEBE0]/10 bg-[#0A2A31]/65 transition duration-300 hover:-translate-y-1 hover:border-[#F4B63F]/35">
                      <div className="flex items-center justify-between border-b border-dashed border-[#EFEBE0]/15 px-5 py-4">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/40">Digital ticket</p>
                          <p className="mt-1 font-semibold">Pass {String(index + 1).padStart(2, '0')}</p>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${ticketStatus.text}`}><span className={`h-1.5 w-1.5 rounded-full ${ticketStatus.dot}`} />{ticketStatus.label}</span>
                      </div>
                      <div className="flex flex-col items-center px-5 py-6 text-center">
                        <div className="rounded-2xl bg-[#EFEBE0] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.2)]">
                          <QRCodeSVG value={ticket.ticket_reference} size={148} level="M" includeMargin bgColor="#EFEBE0" fgColor="#0A2A31" />
                        </div>
                        <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#EFEBE0]/40">Ticket reference</p>
                        <p className="mt-1 max-w-full break-all font-mono text-sm font-bold tracking-wide text-[#F4B63F]">{ticket.ticket_reference}</p>
                        <p className="mt-2 text-xs text-[#EFEBE0]/45">Scan at the cinema entrance</p>
                      </div>
                      <div className="flex items-center gap-2 border-t border-dashed border-[#EFEBE0]/15 px-5 py-3 text-[10px] uppercase tracking-[0.14em] text-[#EFEBE0]/35">
                        <span className="h-2 w-2 rounded-full bg-[#C2305E]" />
                        Konkani Samudai · Official admission pass
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#EFEBE0]/15 px-5 py-10 text-center">
                <div className="text-3xl text-[#F4B63F]">◌</div>
                <h3 className="mt-3 font-serif text-xl">Tickets are being prepared</h3>
                <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#EFEBE0]/55">Your ticket QR codes will appear here when they’re available. Keep this page open while your booking is pending.</p>
              </div>
            )}

            {error ? <p role="status" className="mt-5 rounded-xl border border-[#C2305E]/30 bg-[#C2305E]/10 px-4 py-3 text-sm text-[#F08BA8]">Could not refresh booking status: {error}</p> : null}

            <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-[#F4B63F]/20 bg-[#F4B63F]/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">Ready for the big screen?</p>
                <p className="mt-1 text-xs leading-5 text-[#EFEBE0]/55">Keep your QR codes bright and ready to scan at entry.</p>
              </div>
              <Link to="/" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#C2305E] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#C2305E]/15 transition hover:-translate-y-0.5 hover:bg-[#d34470]">Explore more movies <span aria-hidden="true">→</span></Link>
            </div>
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-2 px-2 py-6 text-[10px] uppercase tracking-[0.16em] text-[#EFEBE0]/30 sm:flex-row">
          <span>Made for the love of Konkani cinema</span>
          <span>Keep your booking reference safe</span>
        </footer>
      </div>
    </main>
  );
}
