create table if not exists public.client_update_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  qr_token_id uuid references public.qr_status_tokens(id) on delete set null,
  record_type text not null check (record_type in ('repair', 'sale')),
  legacy_record_id bigint not null,
  status_key text not null,
  status_label text not null,
  message text,
  estimated_date text,
  recipient_email text,
  email_subject text,
  delivery_status text not null check (delivery_status in ('sent', 'failed', 'not_requested')),
  delivery_error text,
  provider_message_id text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists client_update_history_ticket_idx
  on public.client_update_history(shop_id, record_type, legacy_record_id, created_at desc);

alter table public.client_update_history enable row level security;

grant select, insert on public.client_update_history to authenticated;

create policy "active staff can read client update history"
on public.client_update_history for select to authenticated
using (public.is_active_shop_staff(shop_id));

create policy "active staff can create client update history"
on public.client_update_history for insert to authenticated
with check (
  public.is_active_shop_staff(shop_id)
  and created_by = (select auth.uid())
);
