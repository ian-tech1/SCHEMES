create table if not exists academic_calendar_events (
  id serial primary key,
  user_id text not null,
  kind text not null check (kind in ('term', 'half-term', 'holiday', 'staff-day', 'exam')),
  title text not null,
  starts_on date not null,
  ends_on date not null,
  note text not null default '',
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create index if not exists academic_calendar_user_dates_idx
  on academic_calendar_events (user_id, starts_on, ends_on, id desc);
