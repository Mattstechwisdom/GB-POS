-- GadgetBoy POS cloud schema
-- Source reference: local comprehensive backup structure only.
-- Production import source must be a fresh shop-PC backup created at cutover.

create extension if not exists pgcrypto;

create type public.staff_role as enum ('admin', 'manager', 'technician');
create type public.staff_status as enum ('invited', 'active', 'disabled');

create table public.shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_profiles (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  role public.staff_role not null default 'technician',
  status public.staff_status not null default 'invited',
  first_name text,
  last_name text,
  nickname text,
  phone text,
  email text not null,
  schedule jsonb not null default '{}'::jsonb,
  legacy_id text,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, email)
);

create table public.technician_private_credentials (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  staff_profile_id uuid references public.staff_profiles(id) on delete cascade,
  legacy_technician_id text,
  legacy_passcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_technician_id)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  first_name text,
  last_name text,
  email text,
  phone text,
  phone_alt text,
  zip text,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  customer_id uuid references public.customers(id) on delete set null,
  legacy_customer_id bigint,
  addon_sale_id uuid,
  legacy_addon_sale_id bigint,
  status text,
  assigned_to text,
  check_in_at timestamptz,
  repair_completion_date timestamptz,
  checkout_date timestamptz,
  product_category text,
  product_description text,
  model text,
  serial text,
  intake_source text,
  problem_info text,
  work_order_type text,
  parts_ordered boolean not null default false,
  parts_dates text,
  parts_order_url text,
  parts_tracking_url text,
  parts_order_date timestamptz,
  parts_estimated_delivery timestamptz,
  parts_est_delivery timestamptz,
  discount numeric(12,2) not null default 0,
  discount_type text,
  discount_pct_value numeric(7,4),
  amount_paid numeric(12,2) not null default 0,
  tax_rate numeric(7,4) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  part_costs numeric(12,2) not null default 0,
  payment_type text,
  totals jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  internal_notes text,
  internal_notes_log jsonb not null default '[]'::jsonb,
  pattern_sequence jsonb not null default '[]'::jsonb,
  drone_checklist jsonb not null default '{}'::jsonb,
  dropoff_accessories jsonb not null default '[]'::jsonb,
  activity_at timestamptz,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.work_order_private_credentials (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  legacy_work_order_id bigint,
  device_password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, work_order_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  customer_id uuid references public.customers(id) on delete set null,
  legacy_customer_id bigint,
  customer_name text,
  customer_phone text,
  customer_email text,
  status text,
  assigned_to text,
  category text,
  item_description text,
  condition text,
  intake_source text,
  notes text,
  in_stock boolean,
  quantity numeric(12,2),
  price numeric(12,2),
  total numeric(12,2),
  discount numeric(12,2) not null default 0,
  discount_type text,
  discount_pct_value numeric(7,4),
  amount_paid numeric(12,2) not null default 0,
  tax_rate numeric(7,4) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  part_costs numeric(12,2) not null default 0,
  payment_type text,
  ordered_date timestamptz,
  estimated_delivery_date timestamptz,
  check_in_at timestamptz,
  repair_completion_date timestamptz,
  checkout_date timestamptz,
  client_pickup_date timestamptz,
  parts_order_url text,
  parts_tracking_url text,
  consultation_hours numeric(12,2),
  consultation_type text,
  consultation_address text,
  driver_fee numeric(12,2),
  appointment_date date,
  appointment_time text,
  appointment_end_time text,
  items jsonb not null default '[]'::jsonb,
  payments jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

alter table public.work_orders
  add constraint work_orders_addon_sale_id_fkey
  foreign key (addon_sale_id) references public.sales(id) on delete set null;

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  customer_id uuid references public.customers(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete cascade,
  sale_id uuid references public.sales(id) on delete cascade,
  legacy_customer_id bigint,
  legacy_work_order_id bigint,
  legacy_sale_id bigint,
  event_date date,
  title text,
  event_time text,
  end_time text,
  category text,
  location text,
  customer_name text,
  customer_phone text,
  technician text,
  notes text,
  part_name text,
  source text,
  order_url text,
  parts_status text,
  consultation_type text,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.device_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  name text not null,
  title text,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id),
  unique (shop_id, name)
);

create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  name text not null,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id),
  unique (shop_id, name)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  item_description text,
  price numeric(12,2) not null default 0,
  internal_cost numeric(12,2) not null default 0,
  notes text,
  condition text,
  category text,
  track_stock boolean not null default false,
  stock_count integer not null default 0,
  low_stock_threshold integer not null default 0,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.repair_categories (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id text,
  category text,
  repair_category text,
  title text,
  alt_description text,
  part_cost numeric(12,2) not null default 0,
  labor_cost numeric(12,2) not null default 0,
  internal_cost numeric(12,2) not null default 0,
  order_date text,
  est_delivery text,
  part_source text,
  order_source_url text,
  type text,
  model text,
  track_stock boolean not null default false,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.repair_items (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.part_sources (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id),
  unique (shop_id, name)
);

create table public.intake_sources (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  name text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id),
  unique (shop_id, name)
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  name text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  customer_id uuid references public.customers(id) on delete set null,
  work_order_id uuid references public.work_orders(id) on delete set null,
  sale_id uuid references public.sales(id) on delete set null,
  amount numeric(12,2),
  payment_type text,
  paid_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  staff_profile_id uuid references public.staff_profiles(id) on delete set null,
  legacy_technician_id text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.shop_settings (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  shop_address text,
  shop_lat numeric(12,8),
  shop_lng numeric(12,8),
  payload jsonb not null default '{}'::jsonb,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id),
  unique (shop_id)
);

create table public.preferences (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, key),
  unique (shop_id, legacy_id)
);

create table public.system_logs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id bigint,
  level text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  source_file_name text not null,
  source_backup_timestamp timestamptz,
  source_total_records integer,
  status text not null default 'created',
  counts jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index customers_shop_phone_idx on public.customers(shop_id, phone);
create index customers_shop_email_idx on public.customers(shop_id, email);
create index work_orders_shop_status_idx on public.work_orders(shop_id, status);
create index work_orders_shop_customer_idx on public.work_orders(shop_id, customer_id);
create index work_orders_shop_check_in_idx on public.work_orders(shop_id, check_in_at desc);
create index sales_shop_customer_idx on public.sales(shop_id, customer_id);
create index sales_shop_check_in_idx on public.sales(shop_id, check_in_at desc);
create index calendar_events_shop_date_idx on public.calendar_events(shop_id, event_date);
create index products_shop_category_idx on public.products(shop_id, category);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_active_shop_staff(target_shop_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.shop_id = target_shop_id
      and sp.user_id = (select auth.uid())
      and sp.status = 'active'
  );
$$;

create or replace function public.has_shop_role(target_shop_id uuid, allowed_roles public.staff_role[])
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.shop_id = target_shop_id
      and sp.user_id = (select auth.uid())
      and sp.status = 'active'
      and sp.role = any(allowed_roles)
  );
$$;

create trigger shops_set_updated_at before update on public.shops for each row execute function public.set_updated_at();
create trigger staff_profiles_set_updated_at before update on public.staff_profiles for each row execute function public.set_updated_at();
create trigger technician_private_credentials_set_updated_at before update on public.technician_private_credentials for each row execute function public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();
create trigger work_orders_set_updated_at before update on public.work_orders for each row execute function public.set_updated_at();
create trigger work_order_private_credentials_set_updated_at before update on public.work_order_private_credentials for each row execute function public.set_updated_at();
create trigger sales_set_updated_at before update on public.sales for each row execute function public.set_updated_at();
create trigger calendar_events_set_updated_at before update on public.calendar_events for each row execute function public.set_updated_at();
create trigger device_categories_set_updated_at before update on public.device_categories for each row execute function public.set_updated_at();
create trigger product_categories_set_updated_at before update on public.product_categories for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products for each row execute function public.set_updated_at();
create trigger repair_categories_set_updated_at before update on public.repair_categories for each row execute function public.set_updated_at();
create trigger repair_items_set_updated_at before update on public.repair_items for each row execute function public.set_updated_at();
create trigger part_sources_set_updated_at before update on public.part_sources for each row execute function public.set_updated_at();
create trigger intake_sources_set_updated_at before update on public.intake_sources for each row execute function public.set_updated_at();
create trigger suppliers_set_updated_at before update on public.suppliers for each row execute function public.set_updated_at();
create trigger vendors_set_updated_at before update on public.vendors for each row execute function public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute function public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();
create trigger time_entries_set_updated_at before update on public.time_entries for each row execute function public.set_updated_at();
create trigger shop_settings_set_updated_at before update on public.shop_settings for each row execute function public.set_updated_at();
create trigger preferences_set_updated_at before update on public.preferences for each row execute function public.set_updated_at();

alter table public.shops enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.technician_private_credentials enable row level security;
alter table public.customers enable row level security;
alter table public.work_orders enable row level security;
alter table public.work_order_private_credentials enable row level security;
alter table public.sales enable row level security;
alter table public.calendar_events enable row level security;
alter table public.device_categories enable row level security;
alter table public.product_categories enable row level security;
alter table public.products enable row level security;
alter table public.repair_categories enable row level security;
alter table public.repair_items enable row level security;
alter table public.part_sources enable row level security;
alter table public.intake_sources enable row level security;
alter table public.suppliers enable row level security;
alter table public.vendors enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.time_entries enable row level security;
alter table public.shop_settings enable row level security;
alter table public.preferences enable row level security;
alter table public.system_logs enable row level security;
alter table public.import_batches enable row level security;

grant usage on schema public to authenticated;

grant select on public.shops to authenticated;
grant select on public.staff_profiles to authenticated;

grant select, insert, update, delete on public.customers to authenticated;
grant select, insert, update, delete on public.work_orders to authenticated;
grant select, insert, update, delete on public.sales to authenticated;
grant select, insert, update, delete on public.calendar_events to authenticated;
grant select, insert, update, delete on public.device_categories to authenticated;
grant select, insert, update, delete on public.product_categories to authenticated;
grant select, insert, update, delete on public.products to authenticated;
grant select, insert, update, delete on public.repair_categories to authenticated;
grant select, insert, update, delete on public.repair_items to authenticated;
grant select, insert, update, delete on public.part_sources to authenticated;
grant select, insert, update, delete on public.intake_sources to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.vendors to authenticated;
grant select, insert, update, delete on public.invoices to authenticated;
grant select, insert, update, delete on public.payments to authenticated;
grant select, insert, update, delete on public.time_entries to authenticated;
grant select, insert, update, delete on public.shop_settings to authenticated;
grant select, insert, update, delete on public.preferences to authenticated;

grant select on public.technician_private_credentials to authenticated;
grant select, insert, update, delete on public.work_order_private_credentials to authenticated;
grant select on public.system_logs to authenticated;
grant select on public.import_batches to authenticated;

create policy "active staff can read their shop"
on public.shops for select
to authenticated
using (public.is_active_shop_staff(id));

create policy "users can read their own staff profile"
on public.staff_profiles for select
to authenticated
using (user_id = (select auth.uid()));

create policy "active staff can read shop customers"
on public.customers for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can insert shop customers"
on public.customers for insert to authenticated
with check (public.is_active_shop_staff(shop_id));
create policy "active staff can update shop customers"
on public.customers for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));
create policy "managers can delete shop customers"
on public.customers for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read work orders"
on public.work_orders for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can insert work orders"
on public.work_orders for insert to authenticated
with check (public.is_active_shop_staff(shop_id));
create policy "active staff can update work orders"
on public.work_orders for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));
create policy "managers can delete work orders"
on public.work_orders for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read sales"
on public.sales for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can insert sales"
on public.sales for insert to authenticated
with check (public.is_active_shop_staff(shop_id));
create policy "active staff can update sales"
on public.sales for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));
create policy "managers can delete sales"
on public.sales for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read calendar events"
on public.calendar_events for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can insert calendar events"
on public.calendar_events for insert to authenticated
with check (public.is_active_shop_staff(shop_id));
create policy "active staff can update calendar events"
on public.calendar_events for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));
create policy "active staff can delete calendar events"
on public.calendar_events for delete to authenticated
using (public.is_active_shop_staff(shop_id));

create policy "admins can read technician private credentials"
on public.technician_private_credentials for select to authenticated
using (public.has_shop_role(shop_id, array['admin']::public.staff_role[]));
create policy "admins can manage technician private credentials"
on public.technician_private_credentials for all to authenticated
using (public.has_shop_role(shop_id, array['admin']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin']::public.staff_role[]));

create policy "admins can read work order private credentials"
on public.work_order_private_credentials for select to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));
create policy "managers can manage work order private credentials"
on public.work_order_private_credentials for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read device categories"
on public.device_categories for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage device categories"
on public.device_categories for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read product categories"
on public.product_categories for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage product categories"
on public.product_categories for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read products"
on public.products for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage products"
on public.products for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read repair categories"
on public.repair_categories for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage repair categories"
on public.repair_categories for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read repair items"
on public.repair_items for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage repair items"
on public.repair_items for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read lookup tables"
on public.part_sources for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage lookup part sources"
on public.part_sources for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read intake sources"
on public.intake_sources for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage intake sources"
on public.intake_sources for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read suppliers"
on public.suppliers for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage suppliers"
on public.suppliers for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read vendors"
on public.vendors for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage vendors"
on public.vendors for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read invoices"
on public.invoices for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "managers can manage invoices"
on public.invoices for all to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read payments"
on public.payments for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can insert payments"
on public.payments for insert to authenticated
with check (public.is_active_shop_staff(shop_id));
create policy "managers can update payments"
on public.payments for update to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));
create policy "managers can delete payments"
on public.payments for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read time entries"
on public.time_entries for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can insert time entries"
on public.time_entries for insert to authenticated
with check (public.is_active_shop_staff(shop_id));
create policy "active staff can update time entries"
on public.time_entries for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));
create policy "managers can delete time entries"
on public.time_entries for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));

create policy "active staff can read shop settings"
on public.shop_settings for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "admins can manage shop settings"
on public.shop_settings for all to authenticated
using (public.has_shop_role(shop_id, array['admin']::public.staff_role[]))
with check (public.has_shop_role(shop_id, array['admin']::public.staff_role[]));

create policy "active staff can read preferences"
on public.preferences for select to authenticated
using (public.is_active_shop_staff(shop_id));
create policy "active staff can manage preferences"
on public.preferences for all to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));

create policy "admins can read system logs"
on public.system_logs for select to authenticated
using (public.has_shop_role(shop_id, array['admin']::public.staff_role[]));
create policy "admins can read import batches"
on public.import_batches for select to authenticated
using (public.has_shop_role(shop_id, array['admin']::public.staff_role[]));
