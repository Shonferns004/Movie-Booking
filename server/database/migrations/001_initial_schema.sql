CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  mobile TEXT,
  password_hash TEXT,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS guest_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  mobile TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS theatres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auditoriums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  theatre_id UUID NOT NULL REFERENCES theatres(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  active_layout_version_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seat_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS seat_layout_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditorium_id UUID NOT NULL REFERENCES auditoriums(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  source_file_name TEXT,
  source_file_hash TEXT,
  import_status TEXT NOT NULL DEFAULT 'draft',
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auditorium_id, version)
);

ALTER TABLE auditoriums
  ADD CONSTRAINT auditoriums_active_layout_fk
  FOREIGN KEY (active_layout_version_id) REFERENCES seat_layout_versions(id);

CREATE TABLE IF NOT EXISTS seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditorium_id UUID NOT NULL REFERENCES auditoriums(id) ON DELETE CASCADE,
  layout_version_id UUID NOT NULL REFERENCES seat_layout_versions(id) ON DELETE CASCADE,
  seat_key TEXT NOT NULL,
  row_label TEXT NOT NULL,
  seat_number TEXT NOT NULL,
  x INTEGER NOT NULL,
  y INTEGER NOT NULL,
  category_id UUID REFERENCES seat_categories(id),
  seat_type TEXT NOT NULL DEFAULT 'seat',
  status TEXT NOT NULL DEFAULT 'active',
  accessible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (layout_version_id, seat_key)
);

CREATE TABLE IF NOT EXISTS movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  synopsis TEXT,
  duration_minutes INTEGER NOT NULL,
  language TEXT,
  genre TEXT,
  certification TEXT,
  release_date DATE,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS movie_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  url TEXT NOT NULL,
  alt_text TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id),
  auditorium_id UUID NOT NULL REFERENCES auditoriums(id),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  booking_opens_at TIMESTAMPTZ NOT NULL,
  booking_closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS show_seat_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  category_id UUID REFERENCES seat_categories(id),
  seat_id UUID REFERENCES seats(id),
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  UNIQUE (show_id, category_id, seat_id)
);

CREATE TABLE IF NOT EXISTS show_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  seat_id UUID NOT NULL REFERENCES seats(id),
  status TEXT NOT NULL DEFAULT 'available',
  hold_id UUID,
  booking_id UUID,
  price_minor INTEGER,
  currency TEXT DEFAULT 'INR',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (show_id, seat_id)
);

CREATE TABLE IF NOT EXISTS seat_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES users(id),
  guest_customer_id UUID REFERENCES guest_customers(id),
  session_ref TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at TIMESTAMPTZ
);

ALTER TABLE show_seats
  ADD CONSTRAINT show_seats_hold_fk FOREIGN KEY (hold_id) REFERENCES seat_holds(id);

CREATE TABLE IF NOT EXISTS seat_hold_items (
  hold_id UUID NOT NULL REFERENCES seat_holds(id) ON DELETE CASCADE,
  show_seat_id UUID NOT NULL REFERENCES show_seats(id) ON DELETE CASCADE,
  PRIMARY KEY (hold_id, show_seat_id)
);

CREATE TABLE IF NOT EXISTS blocked_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  show_seat_id UUID NOT NULL REFERENCES show_seats(id) ON DELETE CASCADE,
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_reference TEXT UNIQUE NOT NULL,
  user_id UUID REFERENCES users(id),
  guest_customer_id UUID REFERENCES guest_customers(id),
  show_id UUID NOT NULL REFERENCES shows(id),
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal_minor INTEGER NOT NULL DEFAULT 0,
  fees_minor INTEGER NOT NULL DEFAULT 0,
  tax_minor INTEGER NOT NULL DEFAULT 0,
  total_minor INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  contact_email TEXT,
  contact_mobile TEXT,
  hold_id UUID REFERENCES seat_holds(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE show_seats
  ADD CONSTRAINT show_seats_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id);

CREATE TABLE IF NOT EXISTS booking_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  show_seat_id UUID NOT NULL REFERENCES show_seats(id),
  seat_label TEXT NOT NULL,
  category_name TEXT,
  price_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR'
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  provider_order_id TEXT,
  provider_payment_id TEXT,
  amount_minor INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'created',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  processing_status TEXT NOT NULL DEFAULT 'received',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  amount_minor INTEGER NOT NULL,
  reason TEXT,
  provider_refund_id TEXT,
  status TEXT NOT NULL DEFAULT 'initiated',
  initiated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  booking_seat_id UUID NOT NULL REFERENCES booking_seats(id) ON DELETE CASCADE,
  ticket_reference TEXT UNIQUE NOT NULL,
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued',
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ticket_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES tickets(id),
  show_id UUID REFERENCES shows(id),
  staff_user_id UUID REFERENCES users(id),
  result TEXT NOT NULL,
  rejection_reason TEXT,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB
);

CREATE TABLE IF NOT EXISTS email_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  template_data JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_message_id TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shows_movie ON shows(movie_id);
CREATE INDEX IF NOT EXISTS idx_shows_auditorium ON shows(auditorium_id);
CREATE INDEX IF NOT EXISTS idx_show_seats_show ON show_seats(show_id);
CREATE INDEX IF NOT EXISTS idx_bookings_show ON bookings(show_id);
CREATE INDEX IF NOT EXISTS idx_tickets_booking ON tickets(booking_id);
CREATE INDEX IF NOT EXISTS idx_email_outbox_status ON email_outbox(status, next_attempt_at);
