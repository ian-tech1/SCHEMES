alter table settings add column if not exists default_lessons int not null default 5;
alter table settings add column if not exists default_minutes int not null default 40;
