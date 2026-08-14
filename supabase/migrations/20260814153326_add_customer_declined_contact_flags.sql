alter table public.customers
  add column if not exists declined_phone boolean not null default false,
  add column if not exists declined_email boolean not null default false;
