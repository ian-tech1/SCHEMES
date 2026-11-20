-- Daraja STK Push. Secrets stay in server environment variables.
alter table payments add column if not exists checkout_request_id text;
alter table payments add column if not exists merchant_request_id text not null default '';
alter table payments add column if not exists result_code integer;
alter table payments add column if not exists result_description text not null default '';
alter table payments add column if not exists paid_phone text not null default '';
alter table payments add column if not exists paid_amount int;
alter table payments add column if not exists error_message text not null default '';
create unique index if not exists payments_checkout_request_uidx
  on payments (checkout_request_id)
  where checkout_request_id is not null;
