-- Add saved Quote Generator records to cloud sync.
-- Stores the complete local quote object in payload so sales/repairs quote fields,
-- item details, lines, totals, and future quote-specific fields survive round trips.

create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  legacy_customer_id bigint,
  quote_type text,
  customer_name text,
  customer_phone text,
  customer_email text,
  payload jsonb not null default '{}'::jsonb,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  content_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create index if not exists quotes_shop_customer_idx on public.quotes(shop_id, legacy_customer_id);
create index if not exists quotes_shop_updated_idx on public.quotes(shop_id, content_updated_at desc, updated_at desc);

drop trigger if exists quotes_set_updated_at on public.quotes;
create trigger quotes_set_updated_at before update on public.quotes for each row execute function public.set_updated_at();

alter table public.quotes enable row level security;

grant select, insert, update, delete on public.quotes to authenticated;
grant all privileges on public.quotes to service_role;

drop policy if exists "active staff can read quotes" on public.quotes;
create policy "active staff can read quotes"
on public.quotes for select to authenticated
using (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can insert quotes" on public.quotes;
create policy "active staff can insert quotes"
on public.quotes for insert to authenticated
with check (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can update quotes" on public.quotes;
create policy "active staff can update quotes"
on public.quotes for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));

drop policy if exists "managers can delete quotes" on public.quotes;
create policy "managers can delete quotes"
on public.quotes for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));
