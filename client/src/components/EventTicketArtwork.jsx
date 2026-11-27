import StyledQr from './StyledQr.jsx';

const rupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/**
 * Event pass artwork: the show's own ticket with a background image chosen in
 * the admin app. A titanium veil keeps the text readable over any photo.
 */
export default function EventTicketArtwork({ ticket, backgroundUrl }) {
  const title = ticket?.eventTitle || 'Community event';
  const date = ticket?.eventDate || '';
  const time = ticket?.eventTime || '';
  const venue = ticket?.venue || '';
  const amountMinor = Number(ticket?.baseAmountMinor ?? ticket?.amountMinor ?? 0);
  const amount = amountMinor / 100;
  const quantity = Number(ticket?.quantity || 1);
  const tier = ticket?.tierName || 'Entry';
  const buyer = ticket?.buyerName || '';
  const orderId = ticket?.orderId || '';

  return (
    <article
      className="event-ticket relative overflow-hidden rounded-[22px] bg-[#B5AFA6] text-[#1E2227] shadow-[0_30px_70px_-35px_rgba(0,0,0,0.6)]"
      style={{ '--kk-ticket-bg': '#1E2227' }}
    >
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(420px 220px at 12% 15%, rgba(200,255,31,0.35), transparent 65%), radial-gradient(380px 200px at 92% 85%, rgba(30,34,39,0.18), transparent 70%)',
          }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg, rgba(181, 175, 166, 0.94) 0%, rgba(181, 175, 166, 0.86) 52%, rgba(181, 175, 166, 0.74) 100%)',
        }}
      />

      <div className="relative grid sm:grid-cols-[minmax(0,1fr)_190px]">
        <div className="px-6 py-6 sm:px-8 sm:py-7">
          <p className="text-[9px] font-bold uppercase tracking-[0.28em] text-[#1E2227]/80">
            Konkani Samudai · Event pass
          </p>
          <h2 className="mt-3 line-clamp-3 font-['Tempting',Georgia,serif] text-[36px] font-bold uppercase leading-[0.98] tracking-[-0.01em] sm:text-[50px]">
            {title}
          </h2>

          <p className="mt-4 text-[12px] font-bold uppercase tracking-[0.16em]">
            {date || 'Date TBA'}
            {time ? ` · ${time}` : ''}
          </p>
          {venue && (
            <p className="mt-1 text-[10.5px] uppercase tracking-[0.12em] text-[#1E2227]/70">{venue}</p>
          )}

          <p className="mt-5 text-[12px] font-bold uppercase tracking-[0.16em]">
            Ticket price: {rupees(amount)}
          </p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#1E2227]/55">
            (indirect taxes included)
          </p>
          <p className="mt-3 text-[10px] text-[#1E2227]/75">
            {quantity} × {tier}
            {buyer ? ` · ${buyer}` : ''}
          </p>
        </div>

        <div className="relative border-t border-dashed border-[#1E2227]/30 px-4 py-5 sm:border-l sm:border-t-0">
          <span
            aria-hidden="true"
            className="absolute -left-2.5 -top-2.5 hidden h-5 w-5 rounded-full sm:block"
            style={{ background: 'var(--kk-ticket-bg)' }}
          />
          <span
            aria-hidden="true"
            className="absolute -bottom-2.5 -left-2.5 hidden h-5 w-5 rounded-full sm:block"
            style={{ background: 'var(--kk-ticket-bg)' }}
          />
          <span
            aria-hidden="true"
            className="absolute -left-2.5 top-4 h-5 w-5 rounded-full sm:hidden"
            style={{ background: 'var(--kk-ticket-bg)' }}
          />
          <span
            aria-hidden="true"
            className="absolute -right-2.5 top-4 h-5 w-5 rounded-full sm:hidden"
            style={{ background: 'var(--kk-ticket-bg)' }}
          />

          <div className="flex h-full items-center justify-center gap-3">
            <span
              className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#1E2227]/70"
              style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
            >
              Admit one
            </span>
            <div className="overflow-hidden rounded-lg">
              <StyledQr value={orderId} size={104} accent="#1E2227" background="#F2F0EC" logo={false} />
            </div>
          </div>
          <p className="mt-2 truncate text-center font-mono text-[7px] tracking-[0.04em] text-[#1E2227]/60">
            {orderId}
          </p>
        </div>
      </div>
    </article>
  );
}
