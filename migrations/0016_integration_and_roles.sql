-- School integration variables, and deputy as a real profile role.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'deputy', 'teacher'));

update settings set admin_pin = '' where admin_pin = 'IANTECH526';

create table if not exists integration_settings (
  id int primary key check (id = 1),
  daraja_env text not null default 'sandbox',
  daraja_consumer_key text not null default '',
  daraja_consumer_secret text not null default '',
  daraja_passkey text not null default '',
  daraja_shortcode text not null default '',
  daraja_party_b text not null default '',
  daraja_transaction_type text not null default 'CustomerBuyGoodsOnline',
  daraja_callback_url text not null default '',
  default_payment_phone text not null default '',
  school_code text not null default '',
  nemis_code text not null default '',
  county text not null default '',
  sub_county text not null default '',
  motto text not null default '',
  database_url_note text not null default '',
  updated_at timestamptz not null default now()
);

insert into integration_settings (id) values (1) on conflict (id) do nothing;
