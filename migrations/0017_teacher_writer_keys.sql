create table if not exists teacher_writer_keys (
  user_id text primary key,
  ciphertext text not null,
  hint text not null default '',
  updated_at timestamptz not null default now()
);
