alter table public.products
  add column if not exists markup_pct numeric(8,3);

alter table public.repair_categories
  add column if not exists markup_pct numeric(8,3);
