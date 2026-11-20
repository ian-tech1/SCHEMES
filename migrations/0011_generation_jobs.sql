CREATE TABLE IF NOT EXISTS generation_jobs (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  input jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 5),
  worker_slot smallint,
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_expires_at timestamptz,
  document_id integer REFERENCES documents (id) ON DELETE SET NULL,
  error_message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generation_jobs_queue_idx
  ON generation_jobs (status, available_at, created_at);

CREATE INDEX IF NOT EXISTS generation_jobs_user_idx
  ON generation_jobs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS generation_worker_slots (
  slot_id smallint PRIMARY KEY,
  job_id text UNIQUE REFERENCES generation_jobs (id) ON DELETE SET NULL,
  lease_expires_at timestamptz
);

INSERT INTO generation_worker_slots (slot_id)
VALUES (1), (2), (3)
ON CONFLICT (slot_id) DO NOTHING;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS generation_job_id text;

CREATE UNIQUE INDEX IF NOT EXISTS documents_generation_job_idx
  ON documents (generation_job_id)
  WHERE generation_job_id IS NOT NULL;
