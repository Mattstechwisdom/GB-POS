alter table public.work_orders add column if not exists pickup_ready_at timestamptz;
alter table public.work_orders add column if not exists scheduled_pickup_at timestamptz;
alter table public.work_orders add column if not exists pickup_reminder_sent_at timestamptz;
alter table public.work_orders add column if not exists picked_up_at timestamptz;
alter table public.work_orders add column if not exists client_pickup_date timestamptz;
alter table public.work_orders add column if not exists picked_up_by text;
alter table public.work_orders add column if not exists storage_fee_reviewed_at timestamptz;

create table if not exists public.client_response_tokens (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
 work_order_id uuid not null references public.work_orders(id) on delete cascade, legacy_record_id bigint not null,
 token_hash text not null unique, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create index if not exists client_response_tokens_ticket_idx on public.client_response_tokens(shop_id,legacy_record_id);
alter table public.client_response_tokens enable row level security;
grant select,insert,delete on public.client_response_tokens to authenticated;
create policy "active staff manage client response tokens" on public.client_response_tokens for all to authenticated
 using (public.is_active_shop_staff(shop_id)) with check (public.is_active_shop_staff(shop_id));

create table if not exists public.client_responses (
 id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
 work_order_id uuid not null references public.work_orders(id) on delete cascade, legacy_record_id bigint not null,
 customer_id uuid references public.customers(id) on delete set null, response_type text not null check(response_type in ('approved','declined','question','staff_reply')),
 message text, unread boolean not null default true, resolved_at timestamptz, resolved_by uuid references auth.users(id) on delete set null,
 recipient_email text, delivery_status text, created_at timestamptz not null default now()
);
create index if not exists client_responses_unresolved_idx on public.client_responses(shop_id,resolved_at,created_at desc);
alter table public.client_responses enable row level security;
grant select,insert,update on public.client_responses to authenticated;
create policy "active staff read client responses" on public.client_responses for select to authenticated using(public.is_active_shop_staff(shop_id));
create policy "active staff create client responses" on public.client_responses for insert to authenticated with check(public.is_active_shop_staff(shop_id));
create policy "active staff update client responses" on public.client_responses for update to authenticated using(public.is_active_shop_staff(shop_id)) with check(public.is_active_shop_staff(shop_id));
