-- Customer-initiated cancellation requests and the manual UPI refund queue.
--
-- Refunds are paid out by the venue (the YOUPI gateway only receives UPI credits).
-- This migration adds the request/approval trail and the payout fields the admin
-- app needs to mark a refund as paid with its UTR.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);

CREATE TABLE IF NOT EXISTS booking_cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  requested_by UUID REFERENCES users(id),
  reason TEXT,
  -- pending -> approved | rejected | withdrawn
  status TEXT NOT NULL DEFAULT 'pending',
  -- Snapshot of the policy at request time, so an approval days later still honours
  -- the window the customer saw when they asked.
  policy_percent INTEGER NOT NULL DEFAULT 0,
  paid_minor INTEGER NOT NULL DEFAULT 0,
  refund_minor INTEGER NOT NULL DEFAULT 0,
  review_note TEXT,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- At most one open request per booking; history is kept after review.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cancel_request_pending
  ON booking_cancellation_requests (booking_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_cancel_requests_status
  ON booking_cancellation_requests (status, created_at DESC);

ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'upi',
  ADD COLUMN IF NOT EXISTS utr TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS note TEXT,
  ADD COLUMN IF NOT EXISTS policy_percent INTEGER,
  ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Fill booking_id for any legacy rows created from a payment.
UPDATE refunds rf
   SET booking_id = p.booking_id
  FROM payments p
 WHERE rf.payment_id = p.id
   AND rf.booking_id IS NULL;

-- A payment may only have one live refund. Failed attempts can be retried.
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_payment_active
  ON refunds (payment_id)
  WHERE status IN ('pending', 'processing', 'completed');

CREATE INDEX IF NOT EXISTS idx_refunds_status
  ON refunds (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refunds_booking
  ON refunds (booking_id);
