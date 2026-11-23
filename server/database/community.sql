-- ============================================================================
-- Community pages: events, notices, hero images, members.
-- ============================================================================

CREATE TABLE IF NOT EXISTS community_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  kicker TEXT,
  starts_at TIMESTAMPTZ,
  date_label TEXT,
  time_label TEXT,
  venue TEXT,
  blurb TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  accent TEXT NOT NULL DEFAULT '#F5B841',
  tiers JSONB NOT NULL DEFAULT '[]'::jsonb,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS community_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  tag TEXT,
  date_label TEXT,
  published BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hero_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE hero_images ADD COLUMN IF NOT EXISTS placement TEXT NOT NULL DEFAULT 'hero';

CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  plan TEXT NOT NULL DEFAULT 'family',
  amount_minor INT NOT NULL DEFAULT 120000,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS community_members_user_idx
  ON community_members (user_id) WHERE user_id IS NOT NULL;

-- Ticket checkouts for community events. Movie bookings have their own tables;
-- event passes are paid through the same YOUPI checkout but are not a booking.
CREATE TABLE IF NOT EXISTS community_ticket_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES community_events(id) ON DELETE SET NULL,
  event_title TEXT NOT NULL,
  tier_id TEXT,
  tier_name TEXT,
  quantity INT NOT NULL DEFAULT 1,
  amount_minor INT NOT NULL,
  base_amount_minor INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  buyer_name TEXT,
  phone TEXT,
  provider TEXT NOT NULL DEFAULT 'youpi',
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  utr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_ticket_orders_status_idx
  ON community_ticket_orders (status, created_at DESC);

-- Event passes need their own date/time/venue for the printed ticket.
ALTER TABLE community_ticket_orders ADD COLUMN IF NOT EXISTS event_date TEXT;
ALTER TABLE community_ticket_orders ADD COLUMN IF NOT EXISTS event_time TEXT;
ALTER TABLE community_ticket_orders ADD COLUMN IF NOT EXISTS venue TEXT;

-- Show purchased event passes in My Tickets.
ALTER TABLE community_ticket_orders ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE community_ticket_orders ADD COLUMN IF NOT EXISTS event_starts_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS community_ticket_orders_user_idx
  ON community_ticket_orders (user_id, status);

-- Single membership price, editable from the admin app.
CREATE TABLE IF NOT EXISTS community_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO community_settings (key, value)
VALUES ('membership', '{"label":"Annual membership","amountMinor":120000}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Background artwork for event tickets (editable from the admin gallery).
INSERT INTO community_settings (key, value)
VALUES ('event_ticket', '{"backgroundUrl":""}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- YOUPI checkouts for memberships (separate from movie bookings and event passes).
CREATE TABLE IF NOT EXISTS community_membership_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  email TEXT,
  amount_minor INT NOT NULL,
  base_amount_minor INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  provider TEXT NOT NULL DEFAULT 'youpi',
  provider_order_id TEXT NOT NULL UNIQUE,
  provider_payment_id TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  utr TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS community_membership_orders_status_idx
  ON community_membership_orders (status, created_at DESC);

-- Extra member details collected in the membership form.
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE community_members ADD COLUMN IF NOT EXISTS marital_status TEXT;

ALTER TABLE community_membership_orders ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE community_membership_orders ADD COLUMN IF NOT EXISTS age INT;
ALTER TABLE community_membership_orders ADD COLUMN IF NOT EXISTS dob DATE;
ALTER TABLE community_membership_orders ADD COLUMN IF NOT EXISTS marital_status TEXT;
