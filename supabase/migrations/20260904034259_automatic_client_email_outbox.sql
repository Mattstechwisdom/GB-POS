alter table public.client_update_history
  add column if not exists event_type text,
  add column if not exists event_digest text,
  add column if not exists automatic boolean not null default false;

alter table public.client_update_history
  drop constraint if exists client_update_history_delivery_status_check;

alter table public.client_update_history
  add constraint client_update_history_delivery_status_check
  check (delivery_status in ('pending', 'sending', 'sent', 'failed', 'not_requested', 'not_sent'));

create unique index if not exists client_update_history_automatic_event_unique
  on public.client_update_history(shop_id, record_type, legacy_record_id, event_type, event_digest)
  where automatic and event_type is not null and event_digest is not null;

create or replace function public.queue_automatic_client_email(
  p_record_type text,
  p_legacy_record_id bigint,
  p_event_type text,
  p_event_digest text,
  p_payload jsonb
)
returns public.client_update_history
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_shop_id uuid;
  v_row public.client_update_history;
  v_email text := nullif(btrim(coalesce(p_payload->>'recipient_email', '')), '');
  v_declined boolean := coalesce((p_payload->>'email_declined')::boolean, false);
begin
  if p_record_type not in ('repair', 'sale', 'consult') then raise exception 'Unsupported record type'; end if;
  if p_legacy_record_id is null or p_legacy_record_id <= 0 then raise exception 'Invalid record id'; end if;
  if p_event_type not in ('diagnostic-intake', 'part-awaiting-delivery', 'in-stock-sale', 'consultation-scheduled', 'consultation-updated') then raise exception 'Unsupported automatic email event'; end if;
  if nullif(btrim(p_event_digest), '') is null then raise exception 'Missing event digest'; end if;

  select sp.shop_id into v_shop_id
  from public.staff_profiles sp
  where sp.user_id = auth.uid() and sp.status = 'active'
  limit 1;
  if v_shop_id is null then raise exception 'Active shop membership required'; end if;

  insert into public.client_update_history (
    shop_id, record_type, legacy_record_id, status_key, status_label, message,
    recipient_email, email_subject, email_text, email_html, delivery_status,
    delivery_error, delivery_attempts, next_attempt_at, delivery_updated_at,
    created_by, event_type, event_digest, automatic
  ) values (
    v_shop_id, p_record_type, p_legacy_record_id, p_event_type,
    coalesce(nullif(p_payload->>'status_label', ''), p_event_type),
    nullif(p_payload->>'message', ''), v_email,
    nullif(p_payload->>'email_subject', ''), nullif(p_payload->>'email_text', ''), nullif(p_payload->>'email_html', ''),
    case when v_declined or v_email is null then 'not_sent' else 'pending' end,
    case when v_declined then 'Client declined email.' when v_email is null then 'Client has no email address on file.' else null end,
    0, case when not v_declined and v_email is not null then now() else null end, now(),
    auth.uid(), p_event_type, p_event_digest, true
  )
  on conflict (shop_id, record_type, legacy_record_id, event_type, event_digest)
    where automatic and event_type is not null and event_digest is not null
  do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.client_update_history
    where shop_id = v_shop_id and record_type = p_record_type and legacy_record_id = p_legacy_record_id
      and event_type = p_event_type and event_digest = p_event_digest and automatic
    limit 1;
  end if;
  return v_row;
end;
$$;

revoke all on function public.queue_automatic_client_email(text, bigint, text, text, jsonb) from public;
revoke all on function public.queue_automatic_client_email(text, bigint, text, text, jsonb) from anon;
grant execute on function public.queue_automatic_client_email(text, bigint, text, text, jsonb) to authenticated;
