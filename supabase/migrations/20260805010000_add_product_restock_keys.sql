alter table public.products
  add column if not exists purchase_restock_keys text[] not null default '{}';
