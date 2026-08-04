alter table public.client_update_history
  add column if not exists email_text text,
  add column if not exists email_html text,
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists delivery_updated_at timestamptz not null default now();

alter table public.client_update_history
  drop constraint if exists client_update_history_delivery_status_check;

alter table public.client_update_history
  add constraint client_update_history_delivery_status_check
  check (delivery_status in ('pending', 'sending', 'sent', 'failed', 'not_requested'));

create index if not exists client_update_history_email_outbox_idx
  on public.client_update_history(shop_id, delivery_status, next_attempt_at, created_at)
  where delivery_status in ('pending', 'sending');

grant update on public.client_update_history to authenticated;

drop policy if exists "active staff can update client email delivery" on public.client_update_history;
create policy "active staff can update client email delivery"
on public.client_update_history for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));
