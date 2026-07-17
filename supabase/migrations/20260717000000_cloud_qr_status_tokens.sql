-- Cloud QR/status update support.
-- QR links point to the hosted app with an opaque token. Staff must still sign in
-- before resolving the token or updating a customer/order status.

create table if not exists public.qr_status_tokens (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  token text not null,
  record_type text not null check (record_type in ('repair', 'sale', 'consult')),
  legacy_record_id bigint not null,
  record_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, record_type, legacy_record_id),
  unique (token)
);

alter table public.work_orders
  add column if not exists status_update text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists repair_status text,
  add column if not exists estimated_date text,
  add column if not exists tech_notes text,
  add column if not exists last_update_note text,
  add column if not exists last_update_at timestamptz;

alter table public.sales
  add column if not exists status_update text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists estimated_date text,
  add column if not exists tech_notes text,
  add column if not exists last_update_note text,
  add column if not exists last_update_at timestamptz;

create index if not exists qr_status_tokens_shop_record_idx
  on public.qr_status_tokens(shop_id, record_type, legacy_record_id);

create index if not exists qr_status_tokens_token_idx
  on public.qr_status_tokens(token);

drop trigger if exists qr_status_tokens_set_updated_at on public.qr_status_tokens;
create trigger qr_status_tokens_set_updated_at
before update on public.qr_status_tokens
for each row execute function public.set_updated_at();

alter table public.qr_status_tokens enable row level security;

grant select, insert, update, delete on public.qr_status_tokens to authenticated;

create policy "active staff can read qr status tokens"
on public.qr_status_tokens for select to authenticated
using (public.is_active_shop_staff(shop_id));

create policy "active staff can insert qr status tokens"
on public.qr_status_tokens for insert to authenticated
with check (public.is_active_shop_staff(shop_id));

create policy "active staff can update qr status tokens"
on public.qr_status_tokens for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));

create policy "managers can delete qr status tokens"
on public.qr_status_tokens for delete to authenticated
using (public.has_shop_role(shop_id, array['admin','manager']::public.staff_role[]));
