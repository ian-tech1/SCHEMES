-- Teaching progress, reflections and favourites.
--
-- Until now the "taught" ticks and reflection notes lived only in the browser's
-- localStorage, so they vanished when a teacher changed phone. They now belong
-- to the teacher's account, scoped by user_id like every other table here.

alter table documents add column if not exists favorite boolean not null default false;

create index if not exists documents_favorite_idx on documents (user_id, favorite);

create table if not exists lesson_progress (
  id serial primary key,
  user_id text not null,
  document_id int not null references documents (id) on delete cascade,
  week int not null check (week between 1 and 14),
  lesson int not null check (lesson between 1 and 6),
  taught boolean not null default false,
  reflection text not null default '',
  updated_at timestamptz not null default now(),
  unique (document_id, week, lesson)
);

create index if not exists lesson_progress_user_idx on lesson_progress (user_id, document_id);
