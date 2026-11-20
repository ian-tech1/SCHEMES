CREATE TABLE IF NOT EXISTS curriculum_price_rules (
  id BIGSERIAL PRIMARY KEY,
  grade TEXT NOT NULL CHECK (length(grade) BETWEEN 7 AND 8),
  subject TEXT NOT NULL CHECK (length(subject) BETWEEN 2 AND 80),
  grade_key TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  price_kes INTEGER NOT NULL CHECK (price_kes >= 0 AND price_kes <= 20000),
  updated_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (grade_key, subject_key)
);

CREATE INDEX IF NOT EXISTS curriculum_price_rules_lookup_idx
  ON curriculum_price_rules (grade_key, subject_key);

ALTER TABLE settings ALTER COLUMN desk_lock_minutes SET DEFAULT 43200;
UPDATE settings SET desk_lock_minutes = 43200 WHERE desk_lock_minutes = 30;
