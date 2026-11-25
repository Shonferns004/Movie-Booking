import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import UiIcon from '../components/UiIcon.jsx';

const C = {
  ink: '#1E2227',
  tide: '#262C33',
  shell: '#F2F0EC',
  lime: '#C8FF1F',
};

function formatHours(hours) {
  if (!hours) return '0';
  if (hours < 24) return `${hours} hours`;
  const days = hours / 24;
  return `${Number.isInteger(days) ? days : days.toFixed(1)} ${days === 1 ? 'day' : 'days'}`;
}

function buildCards(tiers = []) {
  const sorted = [...tiers].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  return sorted.map((tier, index) => {
    const previous = sorted[index - 1];
    let window;
    if (index === 0) {
      window = `More than ${formatHours(tier.minHoursBefore)} before the show`;
    } else if (tier.minHoursBefore === 0) {
      window = `Less than ${formatHours(previous.minHoursBefore)} before the show`;
    } else {
      window = `${formatHours(tier.minHoursBefore)} – ${formatHours(previous.minHoursBefore)} before the show`;
    }
    return {
      percent: tier.percent,
      window,
      note: tier.percent === 100
        ? 'Full refund of what you paid.'
        : tier.percent === 0
          ? 'Self-service cancellation is closed. Contact the venue for exceptions.'
          : `${tier.percent}% of what you paid is returned.`,
      highlight: tier.percent === 100,
    };
  });
}

export default function RefundPolicy() {
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/bookings/cancel-policy')
      .then((response) => {
        if (alive) setPolicy(response.data || null);
      })
      .catch(() => {
        if (alive) {
          setPolicy({
            enabled: true,
            tiers: [
              { minHoursBefore: 24, percent: 100 },
              { minHoursBefore: 2, percent: 50 },
              { minHoursBefore: 0, percent: 0 },
            ],
          });
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  const cards = useMemo(() => buildCards(policy?.tiers), [policy]);

  return (
    <main className="min-h-screen w-full pb-20 pt-24" style={{ background: C.ink, color: C.shell }}>
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="mb-10">
          <p className="text-[10px] font-bold uppercase tracking-[0.24em]" style={{ color: C.lime }}>
            Help · Konkani Samudai
          </p>
          <h1 className="mt-3 font-['Fraunces',Georgia,serif] text-4xl font-bold leading-tight sm:text-5xl">
            Cancellation &amp; refunds
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7" style={{ color: `${C.shell}B8` }}>
            You can request a cancellation from <Link to="/my-tickets" className="font-semibold underline underline-offset-4" style={{ color: C.lime }}>My tickets</Link>.
            Requests are reviewed by the venue, and approved refunds are returned to the UPI account you paid from.
          </p>
        </header>

        <section className="rounded-3xl p-5 sm:p-7" style={{ background: C.tide }}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-['Fraunces',Georgia,serif] text-2xl font-bold">Refund windows</h2>
            <span className="rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em]" style={{ borderColor: `${C.shell}26`, color: `${C.shell}B8` }}>
              {policy?.enabled === false ? 'Currently closed' : 'Self-service'}
            </span>
          </div>

          {loading ? (
            <div className="flex items-center gap-3 rounded-2xl px-4 py-10 text-sm" style={{ background: `${C.ink}80`, color: `${C.shell}A8` }}>
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-dashed" style={{ borderColor: C.lime, borderTopColor: 'transparent' }} />
              Loading the current policy…
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-3">
              {cards.map((card) => (
                <article
                  key={`${card.percent}-${card.window}`}
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: card.highlight ? `${C.lime}66` : `${C.shell}1A`,
                    background: card.highlight ? `${C.lime}0F` : `${C.ink}66`,
                  }}
                >
                  <p className="text-3xl font-bold leading-none" style={{ color: card.highlight ? C.lime : C.shell }}>
                    {card.percent}%
                  </p>
                  <p className="mt-3 text-[11px] font-bold uppercase leading-5 tracking-[0.1em]">{card.window}</p>
                  <p className="mt-2 text-[12px] leading-5" style={{ color: `${C.shell}A8` }}>{card.note}</p>
                </article>
              ))}
            </div>
          )}

          <p className="mt-5 rounded-2xl px-4 py-3 text-[12px] leading-5" style={{ background: `${C.ink}80`, color: `${C.shell}A8` }}>
            Refunds are calculated on the amount actually paid, including any payment-verification amount.
            A request can only be raised while the booking is confirmed and its tickets have not been scanned at the gate.
          </p>
        </section>

        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          {[
            { icon: 'edit', title: 'Request', body: 'Open the pass in My tickets and choose Cancel booking. Pick the reason and confirm.' },
            { icon: 'verified', title: 'Review', body: 'The venue checks the request against the show time. You will see the refund estimate before you confirm.' },
            { icon: 'schedule', title: 'Payout', body: 'Approved refunds are sent to your UPI account. The UTR appears on the cancelled pass once paid.' },
          ].map((step, index) => (
            <article key={step.title} className="rounded-2xl border p-4" style={{ borderColor: `${C.shell}14`, background: `${C.tide}99` }}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: C.lime, color: C.ink }}>
                  <UiIcon name={step.icon} className="text-[18px]" />
                </span>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: `${C.shell}80` }}>
                  Step {index + 1} · {step.title}
                </p>
              </div>
              <p className="mt-3 text-[12.5px] leading-6" style={{ color: `${C.shell}B8` }}>{step.body}</p>
            </article>
          ))}
        </section>

        <section className="mt-6 rounded-3xl p-5 sm:p-7" style={{ background: C.tide }}>
          <h2 className="font-['Fraunces',Georgia,serif] text-2xl font-bold">Common questions</h2>
          <div className="mt-4 divide-y" style={{ borderColor: `${C.shell}14` }}>
            {[
              {
                q: 'Can I cancel after the show has started?',
                a: 'No. Self-service cancellation closes two hours before the show, and a started or scanned booking cannot be cancelled online.',
              },
              {
                q: 'What if the venue cancels the show?',
                a: 'The venue cancels every booking on that show and returns the full amount paid. You do not need to raise a request.',
              },
              {
                q: 'How long does the refund take?',
                a: 'Once the venue approves the request, the payout is queued immediately. UPI transfers usually land within 3–5 working days.',
              },
              {
                q: 'Where can I see the refund status?',
                a: 'Open My tickets, switch to the Cancelled filter, and open the pass. The refund amount, status and UTR are listed there.',
              },
            ].map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold">
                  {item.q}
                  <UiIcon name="expand_more" className="shrink-0 text-[18px] transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-[12.5px] leading-6" style={{ color: `${C.shell}A8` }}>{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4" style={{ borderColor: `${C.shell}14`, background: `${C.tide}80` }}>
          <p className="text-[12px]" style={{ color: `${C.shell}A8` }}>
            Need help with a booking outside these windows?
          </p>
          <Link to="/my-tickets" className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.12em]" style={{ background: C.lime, color: C.ink }}>
            Open My tickets
            <UiIcon name="arrow_forward" className="text-[15px]" />
          </Link>
        </div>
      </div>
    </main>
  );
}
