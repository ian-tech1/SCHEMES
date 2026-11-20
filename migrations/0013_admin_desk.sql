-- Harder admin sign-in.
--
-- The desk key used to be a plain value with a shared starter fallback, and any
-- signed-in administrator could change settings without proving they still held
-- the key. This adds a step-up grant (re-verify the desk key every 30 minutes for
-- privileged changes), a per-account failure tracker that locks the desk after
-- repeated wrong keys, and the audit rows those events write.
CREATE TABLE IF NOT EXISTS admin_access_grants (
  user_id text PRIMARY KEY REFERENCES profiles (user_id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  device_hint text NOT NULL DEFAULT '',
  sign_in_count integer NOT NULL DEFAULT 1,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_key_attempts (
  user_id text PRIMARY KEY,
  failed_attempts integer NOT NULL DEFAULT 0,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz
);

-- Desk keys are now verified against a hash, never a reversible value. The
-- legacy plain column stays so an existing deployment keeps working until the
-- owner sets a new key once (writing both columns).
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_key_hash text NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS admin_key_updated_at timestamptz;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS desk_lock_minutes integer NOT NULL DEFAULT 30;

CREATE INDEX IF NOT EXISTS admin_access_grants_expiry_idx ON admin_access_grants (expires_at);
