create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create index if not exists purchase_orders_shop_status_idx
  on public.purchase_orders (shop_id, ((payload ->> 'status')));

create index if not exists purchase_orders_shop_checked_out_idx
  on public.purchase_orders (shop_id, ((payload ->> 'checkedOutAt')))
  where payload ->> 'status' = 'checked_out';

drop trigger if exists purchase_orders_set_updated_at on public.purchase_orders;
create trigger purchase_orders_set_updated_at
before update on public.purchase_orders
for each row execute function public.set_updated_at();

alter table public.purchase_orders enable row level security;

grant select, insert, update, delete on public.purchase_orders to authenticated;
grant select, insert, update, delete on public.purchase_orders to service_role;

create policy "active staff can read purchase orders"
on public.purchase_orders for select to authenticated
using (public.is_active_shop_staff(shop_id));

create policy "active staff can insert purchase orders"
on public.purchase_orders for insert to authenticated
with check (public.is_active_shop_staff(shop_id));

create policy "active staff can update purchase orders"
on public.purchase_orders for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));

create policy "managers can delete purchase orders"
on public.purchase_orders for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));
