create table if not exists profiles (
  user_id text primary key,
  role text not null default 'teacher' check (role in ('admin', 'teacher')),
  display_name text not null default '',
  email text not null default '',
  phone text not null default '',
  school_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id int primary key check (id = 1),
  till_number text not null default '',
  till_name text not null default 'IAN TECH',
  price_kes int not null default 50,
  whatsapp text not null default '254723278526',
  contact_name text not null default 'IAN TECH',
  welcome text not null default 'Karibu. Name the grade, the learning area, and where the scheme should start and stop. The desk writes the weeks in the CBE shape your head of department expects.',
  admin_pin text not null default '',
  free_for_all boolean not null default false,
  payment_mode text not null default 'instant' check (payment_mode in ('instant', 'approve')),
  daily_gen_limit int not null default 8
);

insert into settings (id) values (1) on conflict (id) do nothing;

create table if not exists documents (
  id serial primary key,
  user_id text not null,
  pack_id text not null,
  kind text not null check (kind in ('scheme', 'lesson', 'notes', 'revision')),
  title text not null,
  level text not null,
  grade text not null,
  subject text not null,
  strand text not null,
  substrand text not null,
  term text not null,
  year int not null,
  week_from int not null,
  week_to int not null,
  lessons_per_week int not null default 1,
  pathway text not null default '',
  school_name text not null default '',
  teacher_name text not null default '',
  phone text not null default '',
  stream text not null default '',
  start_from text not null default '',
  end_at text not null default '',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists documents_user_idx on documents (user_id, id desc);
create index if not exists documents_pack_idx on documents (pack_id);

create table if not exists payments (
  id serial primary key,
  user_id text not null,
  pack_id text not null,
  amount_kes int not null,
  till_number text not null,
  mpesa_code text not null unique,
  phone text not null default '',
  teacher_name text not null default '',
  school_name text not null default '',
  status text not null default 'paid' check (status in ('paid', 'pending', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists payments_user_idx on payments (user_id, id desc);
create index if not exists payments_pack_idx on payments (pack_id);

create table if not exists grants (
  id serial primary key,
  kind text not null check (kind in ('teacher', 'school')),
  teacher_user_id text,
  school_name text not null default '',
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists grants_teacher_idx on grants (teacher_user_id);
create index if not exists grants_school_idx on grants (lower(btrim(school_name)));
