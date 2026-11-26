-- Security hardening: refresh-token lookup, orphaned checkout/hold cleanup.

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
  ON sessions (token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_active
  ON sessions (user_id, revoked_at);

CREATE INDEX IF NOT EXISTS idx_community_open_amounts
  ON community_ticket_orders (status, amount_minor)
  WHERE status IN ('creating', 'created');

-- Existing holds created before session binding was required cannot be authorized.
WITH released AS (
  UPDATE seat_holds
     SET status='released', released_at=now()
   WHERE status='active' AND owner_user_id IS NULL AND session_ref IS NULL
   RETURNING id
)
UPDATE show_seats
   SET status='available', hold_id=NULL, updated_at=now()
 WHERE hold_id IN (SELECT id FROM released);

-- Abandoned placeholder/checkout rows free their reserved amount.
UPDATE community_ticket_orders
   SET status='failed', updated_at=now()
 WHERE status='creating' AND created_at < now() - interval '10 minutes';

UPDATE community_ticket_orders
   SET status='failed', updated_at=now()
 WHERE status='created' AND created_at < now() - interval '24 hours';
