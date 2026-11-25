import { env } from '../../config/env.js';

/**
 * Cancellation policy engine.
 *
 * One source of truth for both the estimate shown before a customer requests a
 * cancellation and the amount recorded when staff approve it. Tiers are expressed in
 * hours before the show starts, highest first, and are tuned with REFUND_TIERS:
 *
 *   REFUND_TIERS=24:100,2:50
 *
 * means "100% until 24 hours before the show, 50% from 24 hours down to 2 hours,
 * nothing after that". A 0% tier is always appended, which is also the point where
 * self-service cancellation closes.
 */

const DEFAULT_TIERS = [
  { minHoursBefore: 24, percent: 100 },
  { minHoursBefore: 2, percent: 50 },
];

function parseTiers(raw) {
  const parsed = String(raw || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [hours, percent] = part.split(':').map((value) => Number(value));
      return { minHoursBefore: hours, percent };
    })
    .filter((tier) => Number.isFinite(tier.minHoursBefore)
      && Number.isFinite(tier.percent)
      && tier.minHoursBefore >= 0
      && tier.percent >= 0
      && tier.percent <= 100);

  // Keep the first entry per boundary and order highest hour first.
  const unique = new Map();
  for (const tier of parsed) {
    if (!unique.has(tier.minHoursBefore)) unique.set(tier.minHoursBefore, tier);
  }
  const tiers = [...unique.values()].sort((a, b) => b.minHoursBefore - a.minHoursBefore);
  if (!tiers.length) return [...DEFAULT_TIERS, { minHoursBefore: 0, percent: 0 }];
  if (!tiers.some((tier) => tier.minHoursBefore === 0)) {
    tiers.push({ minHoursBefore: 0, percent: 0 });
  }
  return tiers;
}

export const REFUND_TIERS = parseTiers(env.REFUND_TIERS);

export const CANCELLATION_ENABLED = env.CANCELLATION_ENABLED !== false;

/** The number of hours before the show where self-service cancellation closes. */
export function cancellationCutoffHours() {
  const paidTiers = REFUND_TIERS.filter((tier) => tier.percent > 0);
  if (!paidTiers.length) return 0;
  return Math.min(...paidTiers.map((tier) => tier.minHoursBefore));
}

export function cancellationPolicy() {
  return {
    enabled: CANCELLATION_ENABLED,
    approvalRequired: true,
    tiers: REFUND_TIERS.map((tier) => ({
      minHoursBefore: tier.minHoursBefore,
      percent: tier.percent,
    })),
    cutoffHours: cancellationCutoffHours(),
  };
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Quote a cancellation for a booking.
 *
 * `paidMinor` must be the amount actually captured (sum of verified payments), not the
 * ticket subtotal: the gateway adds a unique 1-99 paise verification offset, and a
 * 100% refund should return exactly what the customer paid.
 */
export function quoteCancellation({
  startsAt,
  paidMinor,
  totalMinor,
  now = new Date(),
} = {}) {
  const baseMinor = Math.max(0, Number(paidMinor || 0));
  const ticketMinor = Math.max(0, Number(totalMinor || 0));
  const policy = cancellationPolicy();
  const start = toDate(startsAt);

  const common = {
    enabled: policy.enabled,
    approvalRequired: true,
    paidMinor: baseMinor,
    totalMinor: ticketMinor,
    tiers: policy.tiers,
  };

  if (!policy.enabled) {
    return {
      ...common,
      allowed: false,
      percent: 0,
      refundMinor: 0,
      reason: 'Cancellations are currently closed. Please contact the venue.',
    };
  }

  if (!start) {
    return {
      ...common,
      allowed: false,
      percent: 0,
      refundMinor: 0,
      reason: 'The show time is not available yet.',
    };
  }

  const msUntilShow = start.getTime() - now.getTime();
  if (msUntilShow <= 0) {
    return {
      ...common,
      allowed: false,
      percent: 0,
      refundMinor: 0,
      startsAt: start.toISOString(),
      reason: 'This show has already started and can no longer be cancelled.',
    };
  }

  const hoursUntilShow = msUntilShow / 36e5;
  const tier = policy.tiers.find((candidate) => hoursUntilShow >= candidate.minHoursBefore)
    || { minHoursBefore: 0, percent: 0 };

  if (tier.percent <= 0) {
    return {
      ...common,
      allowed: false,
      percent: 0,
      refundMinor: 0,
      startsAt: start.toISOString(),
      hoursUntilShow,
      cutoffAt: new Date(start.getTime() - cancellationCutoffHours() * 36e5).toISOString(),
      reason: `The self-service cancellation window closed ${cancellationCutoffHours()} hours before the show.`,
    };
  }

  if (baseMinor <= 0) {
    return {
      ...common,
      allowed: false,
      percent: tier.percent,
      refundMinor: 0,
      startsAt: start.toISOString(),
      hoursUntilShow,
      reason: 'No captured payment was found for this booking.',
    };
  }

  const refundMinor = Math.min(baseMinor, Math.round((baseMinor * tier.percent) / 100));
  const deadline = new Date(start.getTime() - tier.minHoursBefore * 36e5);

  return {
    ...common,
    allowed: refundMinor > 0,
    percent: tier.percent,
    refundMinor,
    startsAt: start.toISOString(),
    hoursUntilShow,
    minHoursBefore: tier.minHoursBefore,
    deadline: deadline.toISOString(),
    reason: refundMinor > 0
      ? `${tier.percent}% of the amount paid is refundable if you cancel before ${deadline.toISOString()}.`
      : 'Nothing is refundable for this show.',
  };
}
