alter table public.products
  add column if not exists is_parent_part boolean not null default false,
  add column if not exists parent_product_legacy_id bigint,
  add column if not exists variant_attributes jsonb not null default '{}'::jsonb;

alter table public.repair_categories
  add column if not exists repair_family text,
  add column if not exists service_key text,
  add column if not exists inventory_parent_legacy_id bigint;

alter table public.products drop constraint if exists products_variant_attributes_object;
alter table public.products
  add constraint products_variant_attributes_object
  check (jsonb_typeof(variant_attributes) = 'object');

create index if not exists products_shop_parent_legacy_idx
  on public.products (shop_id, parent_product_legacy_id)
  where parent_product_legacy_id is not null;

create index if not exists repair_categories_shop_family_service_idx
  on public.repair_categories (shop_id, lower(repair_family), lower(service_key));
