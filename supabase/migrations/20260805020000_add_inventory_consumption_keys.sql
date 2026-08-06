alter table public.products
  add column if not exists inventory_consumption_keys text[] not null default '{}';

alter table public.repair_categories
  add column if not exists inventory_product_id bigint;
