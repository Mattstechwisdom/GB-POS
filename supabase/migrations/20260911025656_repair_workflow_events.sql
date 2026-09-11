alter table public.work_orders add column if not exists workflow_stage text;
alter table public.work_orders add column if not exists diagnosis_started_at timestamptz;
alter table public.work_orders add column if not exists testing_started_at timestamptz;
alter table public.work_orders add column if not exists last_technician_activity_at timestamptz;
alter table public.work_orders add column if not exists promised_at timestamptz;
alter table public.work_orders add column if not exists promise_note text;
alter table public.work_orders add column if not exists part_eta date;
alter table public.work_orders add column if not exists client_decision text;
alter table public.work_orders add column if not exists client_decision_at timestamptz;
alter table public.work_orders add column if not exists workflow_updated_at timestamptz;
alter table public.client_response_tokens add column if not exists allowed_actions jsonb not null default '["question","add_information"]'::jsonb;
alter table public.client_responses add column if not exists acknowledged_at timestamptz;
alter table public.client_responses add column if not exists acknowledged_by uuid references auth.users(id) on delete set null;
alter table public.client_responses add column if not exists conversation_id uuid;
alter table public.client_responses drop constraint if exists client_responses_response_type_check;
alter table public.client_responses add constraint client_responses_response_type_check check(response_type in ('approved','declined','question','confirmed_pickup','pickup_change_requested','information','staff_reply'));

create table if not exists public.repair_workflow_events (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  legacy_record_id bigint not null,
  action text not null,
  audience text not null check (audience in ('internal', 'client')),
  actor_user_id uuid references auth.users(id) on delete set null,
  note text,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  delivery_status text not null default 'internal',
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (shop_id, idempotency_key)
);

create index if not exists repair_workflow_events_ticket_idx
  on public.repair_workflow_events(shop_id, work_order_id, occurred_at desc);
alter table public.repair_workflow_events enable row level security;
grant select on public.repair_workflow_events to authenticated;
create policy "active staff read repair workflow events"
  on public.repair_workflow_events for select to authenticated
  using (public.is_active_shop_staff(shop_id));

create or replace function public.apply_repair_workflow_event(
  p_shop_id uuid,
  p_work_order_id uuid,
  p_action text,
  p_payload jsonb,
  p_idempotency_key text,
  p_actor_user_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_work_order public.work_orders;
  v_event public.repair_workflow_events;
  v_existing public.repair_workflow_events;
  v_stage text;
  v_repair_status text;
  v_audience text;
  v_items jsonb;
  v_index int;
  v_all_delivered boolean;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'An idempotency key is required';
  end if;

  select * into v_existing from public.repair_workflow_events
   where shop_id = p_shop_id and idempotency_key = p_idempotency_key;
  if found then
    select * into v_work_order from public.work_orders where id = v_existing.work_order_id;
    return jsonb_build_object('event', to_jsonb(v_existing), 'workOrder', to_jsonb(v_work_order), 'duplicate', true);
  end if;

  select * into v_work_order from public.work_orders
   where id = p_work_order_id and shop_id = p_shop_id for update;
  if not found then raise exception 'Work order not found'; end if;

  if p_action not in ('pickup_reminder','manual_update','repair_approval','approval_received','repair_declined','customer_promise','schedule_pickup','picked_up','approve_storage_fee','technician_progress','diagnosis','testing_in_progress','waiting_device','part_ordered','waiting_part','part_delivered','items_delivered','repair_complete','not_possible') then
    raise exception 'Unsupported repair workflow action: %', p_action;
  end if;

  v_audience := case when p_action in ('technician_progress','picked_up','approve_storage_fee') then 'internal' else 'client' end;
  v_stage := case p_action
    when 'diagnosis' then 'Diagnosing'
    when 'repair_approval' then 'Approval'
    when 'approval_received' then 'Repair'
    when 'part_ordered' then 'Parts'
    when 'waiting_part' then 'Parts'
    when 'waiting_device' then 'Waiting Device'
    when 'part_delivered' then 'Repair'
    when 'items_delivered' then 'Repair'
    when 'testing_in_progress' then 'Testing'
    when 'repair_complete' then 'Pickup'
    when 'not_possible' then 'Pickup'
    when 'repair_declined' then 'Pickup'
    when 'schedule_pickup' then 'Pickup'
    when 'pickup_reminder' then 'Pickup'
    when 'picked_up' then 'Completed'
    else null end;
  v_repair_status := case p_action
    when 'diagnosis' then 'Diagnosis In Process'
    when 'repair_approval' then 'Awaiting Repair Approval'
    when 'approval_received' then 'Repair In Progress'
    when 'repair_declined' then 'Repair Declined - Awaiting Pickup'
    when 'waiting_device' then 'Waiting on Device'
    when 'part_ordered' then 'Part Ordered'
    when 'waiting_part' then 'Waiting on Part Delivery'
    when 'part_delivered' then 'Ready for Repair'
    when 'items_delivered' then 'Ready for Repair'
    when 'testing_in_progress' then 'Testing In Progress'
    when 'repair_complete' then 'Ready for Pickup'
    when 'not_possible' then 'Not Repairable - Awaiting Pickup'
    when 'picked_up' then 'Picked Up'
    else null end;

  if p_action = 'items_delivered' then
    v_items := coalesce(v_work_order.items, '[]'::jsonb);
    for v_index in select jsonb_array_elements_text(coalesce(p_payload->'itemIndexes','[]'::jsonb))::int loop
      if v_index >= 0 and v_index < jsonb_array_length(v_items) then
        v_items := jsonb_set(v_items, array[v_index::text], (v_items->v_index) || jsonb_build_object('orderStatus','received','partStatus','delivered','receivedAt',v_now,'partDeliveredAt',v_now));
      end if;
    end loop;
    select bool_and(coalesce(value->>'orderStatus',value->>'partStatus','') ~* 'received|delivered|in.?stock')
      into v_all_delivered from jsonb_array_elements(v_items)
      where coalesce((value->>'requiresOrder')::boolean,false) or coalesce(value->>'orderStatus',value->>'partStatus','') ~* 'needed|ordered|received|delivered|transit|awaiting';
    if not coalesce(v_all_delivered,false) then v_stage := 'Parts'; v_repair_status := 'Waiting on Part Delivery'; end if;
  end if;

  update public.work_orders set
    workflow_stage = coalesce(v_stage, workflow_stage),
    repair_status = coalesce(v_repair_status, repair_status),
    status_update = case when p_action = 'manual_update' then coalesce(p_payload->>'note', status_update) else coalesce(v_repair_status, status_update) end,
    status = case when p_action = 'picked_up' then 'closed' else status end,
    diagnosis_started_at = case when p_action = 'diagnosis' then v_now else diagnosis_started_at end,
    testing_started_at = case when p_action = 'testing_in_progress' then v_now else testing_started_at end,
    last_technician_activity_at = case when p_action in ('diagnosis','technician_progress','testing_in_progress') then v_now else last_technician_activity_at end,
    promised_at = case when p_action = 'customer_promise' then nullif(p_payload->>'promisedAt','')::timestamptz else promised_at end,
    promise_note = case when p_action = 'customer_promise' then nullif(p_payload->>'note','') else promise_note end,
    part_eta = case when p_action in ('part_ordered','waiting_part') then nullif(p_payload->>'estimatedDate','')::date else part_eta end,
    parts_est_delivery = case when p_action in ('part_ordered','waiting_part') then nullif(p_payload->>'estimatedDate','')::timestamptz else parts_est_delivery end,
    scheduled_pickup_at = case when p_action = 'schedule_pickup' then nullif(p_payload->>'scheduledPickupAt','')::timestamptz else scheduled_pickup_at end,
    pickup_ready_at = case when p_action in ('repair_complete','not_possible','repair_declined') then v_now else pickup_ready_at end,
    pickup_reminder_sent_at = case when p_action = 'pickup_reminder' then v_now else pickup_reminder_sent_at end,
    picked_up_at = case when p_action = 'picked_up' then v_now else picked_up_at end,
    client_pickup_date = case when p_action = 'picked_up' then v_now else client_pickup_date end,
    picked_up_by = case when p_action = 'picked_up' then coalesce(p_payload->>'actor','Technician') else picked_up_by end,
    client_decision = case when p_action = 'approval_received' then 'approved' when p_action = 'repair_declined' then 'declined' else client_decision end,
    client_decision_at = case when p_action in ('approval_received','repair_declined') then v_now else client_decision_at end,
    items = case when p_action = 'items_delivered' then v_items else items end,
    workflow_updated_at = v_now,
    updated_at = v_now
   where id = p_work_order_id returning * into v_work_order;

  insert into public.repair_workflow_events(shop_id,work_order_id,legacy_record_id,action,audience,actor_user_id,note,payload,idempotency_key,delivery_status,occurred_at)
  values(p_shop_id,p_work_order_id,v_work_order.legacy_id,p_action,v_audience,p_actor_user_id,nullif(p_payload->>'note',''),coalesce(p_payload,'{}'::jsonb),p_idempotency_key,case when v_audience='internal' then 'internal' else 'pending' end,v_now)
  returning * into v_event;

  return jsonb_build_object('event',to_jsonb(v_event),'workOrder',to_jsonb(v_work_order),'duplicate',false);
end;
$$;

revoke all on function public.apply_repair_workflow_event(uuid,uuid,text,jsonb,text,uuid) from public, anon, authenticated;
grant execute on function public.apply_repair_workflow_event(uuid,uuid,text,jsonb,text,uuid) to service_role;
