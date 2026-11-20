-- Encrypted credentials are written only by owner-authorized server functions.
-- Encryption key material is derived from the existing BETTER_AUTH_SECRET.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS ai_provider_credentials text NOT NULL DEFAULT '';

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS ai_preferred_provider text NOT NULL DEFAULT 'manus';

-- Existing deployments have the original four-kind constraint; allow an exam
-- paper as a distinct library document while retaining all old document kinds.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_kind_check;
ALTER TABLE documents
  ADD CONSTRAINT documents_kind_check
  CHECK (kind IN ('scheme', 'lesson', 'notes', 'revision', 'exam'));
