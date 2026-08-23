set local lock_timeout = '5s';

alter table if exists public.products
  add column if not exists repair_type text;

create index if not exists products_shop_repair_type_idx
  on public.products (shop_id, lower(repair_type))
  where item_type = 'Part' and repair_type is not null;
