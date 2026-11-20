-- Richer teacher content defaults. The desk key stays in settings.admin_pin
-- so the owner can claim the desk without a server secret.
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_note_depth text NOT NULL DEFAULT 'full' CHECK (default_note_depth IN ('full', 'summary'));
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_question_count int NOT NULL DEFAULT 20;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_question_types text NOT NULL DEFAULT 'mcq,short,structured';

-- The singleton slot makes initial bootstrap a one-time, cross-instance operation.
CREATE TABLE IF NOT EXISTS admin_bootstrap_claims (
  slot smallint PRIMARY KEY CHECK (slot = 1),
  user_id text NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO admin_bootstrap_claims (slot, user_id)
SELECT 1, user_id FROM profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1
ON CONFLICT (slot) DO NOTHING;

-- Failed bootstrap attempts survive serverless cold starts and are shared by all instances.
CREATE TABLE IF NOT EXISTS admin_claim_attempts (
  user_id text PRIMARY KEY,
  failed_attempts int NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id bigserial PRIMARY KEY,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_id text NOT NULL DEFAULT '',
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_created_idx ON admin_audit_log (created_at DESC);
