alter table settings add column if not exists scheme_columns text not null default '';
alter table profiles add column if not exists scheme_columns text not null default '';
alter table profiles add column if not exists use_admin_columns boolean not null default true;
