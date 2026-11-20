-- Numbered receipts and the CBC assessment record book.
--
-- Receipts: a teacher printing proof for the school office needs a stable number,
-- not the M-Pesa code repeated. `receipt_no` is issued once, per payment, and
-- printed on every copy of that receipt.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_no text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_issued_at timestamptz;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS item_label text NOT NULL DEFAULT '';
CREATE UNIQUE INDEX IF NOT EXISTS payments_receipt_no_uidx ON payments (receipt_no) WHERE receipt_no IS NOT NULL;

-- Assessment records (marks book). Kenyan primary and junior teachers must keep a
-- record of each learner's score per assessment and convert it to the four CBC
-- levels for the report slip. Until now that only existed on paper.
CREATE TABLE IF NOT EXISTS assessment_records (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  title text NOT NULL,
  grade text NOT NULL,
  stream text NOT NULL DEFAULT '',
  subject text NOT NULL,
  term text NOT NULL,
  year integer NOT NULL,
  assessment_kind text NOT NULL DEFAULT 'written'
    CHECK (assessment_kind IN ('written', 'oral', 'practical', 'project', 'observation', 'midterm', 'endterm')),
  total_marks integer NOT NULL DEFAULT 100,
  taught_on text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assessment_records_user_idx ON assessment_records (user_id, id desc);

CREATE TABLE IF NOT EXISTS assessment_scores (
  id serial PRIMARY KEY,
  record_id integer NOT NULL REFERENCES assessment_records (id) ON DELETE CASCADE,
  roll_no text NOT NULL DEFAULT '',
  learner_name text NOT NULL,
  marks integer,
  note text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (record_id, learner_name)
);
CREATE INDEX IF NOT EXISTS assessment_scores_record_idx ON assessment_scores (record_id, roll_no);

-- Saved searches teachers return to every term ("Grade 4 Mathematics, Term 2").
CREATE TABLE IF NOT EXISTS saved_filters (
  id serial PRIMARY KEY,
  user_id text NOT NULL,
  label text NOT NULL,
  level text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  subject text NOT NULL DEFAULT '',
  term text NOT NULL DEFAULT '',
  year integer,
  kind text NOT NULL DEFAULT 'all',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, label)
);
