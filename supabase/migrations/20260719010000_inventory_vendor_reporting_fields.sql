alter table public.products
  add column if not exists device_model text,
  add column if not exists vendor_relationship text,
  add column if not exists vendor_share_pct numeric(8,3),
  add column if not exists vendor_tax_exempt boolean not null default false;
