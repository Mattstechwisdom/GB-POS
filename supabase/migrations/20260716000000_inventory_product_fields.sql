alter table public.products
  add column if not exists item_type text,
  add column if not exists part_category text,
  add column if not exists distributor text,
  add column if not exists distributor_sku text,
  add column if not exists reorder_qty integer not null default 1,
  add column if not exists reorder_url_template text,
  add column if not exists associated_devices jsonb not null default '[]'::jsonb;

create index if not exists products_shop_item_type_idx on public.products(shop_id, item_type);
