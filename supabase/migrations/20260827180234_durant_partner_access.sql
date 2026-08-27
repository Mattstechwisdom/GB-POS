-- Durant Media partner access is intentionally isolated from authoritative POS edits.
alter type public.staff_role add value if not exists 'durant';

alter table public.work_orders
  add column if not exists diagnostic_selection jsonb,
  add column if not exists durant_full_transfer boolean not null default false;

create or replace function public.is_active_shop_staff(target_shop_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.shop_id = target_shop_id and sp.user_id = (select auth.uid())
      and sp.status = 'active' and sp.role::text <> 'durant'
  );
$$;

create or replace function public.is_durant_partner(target_shop_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff_profiles sp
    where sp.shop_id = target_shop_id and sp.user_id = (select auth.uid())
      and sp.status = 'active' and sp.role::text = 'durant'
  );
$$;

create table if not exists public.durant_proposals (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','ready','returned','approved')),
  proposed_data jsonb not null default '{}'::jsonb,
  return_note text,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (work_order_id, author_user_id)
);

create table if not exists public.durant_shared_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  author_user_id uuid not null default auth.uid() references auth.users(id) on delete restrict,
  body text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.durant_history (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  work_order_id uuid not null references public.work_orders(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  summary text not null,
  safe_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.durant_proposals enable row level security;
alter table public.durant_shared_notes enable row level security;
alter table public.durant_history enable row level security;
grant select, insert, update on public.durant_proposals to authenticated;
grant select, insert on public.durant_shared_notes to authenticated;
grant select, insert on public.durant_history to authenticated;
grant execute on function public.is_durant_partner(uuid) to authenticated;

create policy "durant reads assigned report work orders" on public.work_orders for select to authenticated
using (public.is_durant_partner(shop_id) and work_order_type = 'durantReport');
create policy "durant reads attached clients" on public.customers for select to authenticated
using (public.is_durant_partner(shop_id) and exists (select 1 from public.work_orders wo where wo.shop_id = customers.shop_id and wo.customer_id = customers.id and wo.work_order_type = 'durantReport'));
create policy "durant reads report credentials" on public.work_order_private_credentials for select to authenticated
using (public.is_durant_partner(shop_id) and exists (select 1 from public.work_orders wo where wo.id = work_order_id and wo.work_order_type = 'durantReport'));
create policy "durant reads diagnostic catalog" on public.repair_categories for select to authenticated
using (public.is_durant_partner(shop_id) and (repair_category ilike '%diagnostic%' or title ilike '%diagnostic%'));

create policy "participants read durant proposals" on public.durant_proposals for select to authenticated
using (public.is_active_shop_staff(shop_id) or (public.is_durant_partner(shop_id) and author_user_id = auth.uid()));
create policy "durant creates own proposals" on public.durant_proposals for insert to authenticated
with check (public.is_durant_partner(shop_id) and author_user_id = auth.uid() and exists (select 1 from public.work_orders wo where wo.id = work_order_id and wo.shop_id = durant_proposals.shop_id and wo.work_order_type = 'durantReport'));
create policy "durant updates own unapproved proposals" on public.durant_proposals for update to authenticated
using (public.is_durant_partner(shop_id) and author_user_id = auth.uid() and status <> 'approved')
with check (public.is_durant_partner(shop_id) and author_user_id = auth.uid() and status in ('draft','ready'));
create policy "staff reviews durant proposals" on public.durant_proposals for update to authenticated
using (public.is_active_shop_staff(shop_id)) with check (public.is_active_shop_staff(shop_id) and status in ('returned','approved'));
create policy "participants read shared notes" on public.durant_shared_notes for select to authenticated
using ((public.is_active_shop_staff(shop_id) or public.is_durant_partner(shop_id)) and exists (select 1 from public.work_orders wo where wo.id = work_order_id and wo.work_order_type = 'durantReport'));
create policy "participants add shared notes" on public.durant_shared_notes for insert to authenticated
with check ((public.is_active_shop_staff(shop_id) or public.is_durant_partner(shop_id)) and author_user_id = auth.uid() and exists (select 1 from public.work_orders wo where wo.id = work_order_id and wo.work_order_type = 'durantReport'));
create policy "participants read safe history" on public.durant_history for select to authenticated
using ((public.is_active_shop_staff(shop_id) or public.is_durant_partner(shop_id)) and exists (select 1 from public.work_orders wo where wo.id = work_order_id and wo.work_order_type = 'durantReport'));
create policy "participants add safe history" on public.durant_history for insert to authenticated
with check ((public.is_active_shop_staff(shop_id) or public.is_durant_partner(shop_id)) and actor_user_id = auth.uid() and exists (select 1 from public.work_orders wo where wo.id = work_order_id and wo.work_order_type = 'durantReport'));

create or replace function public.approve_durant_proposal(target_proposal_id uuid)
returns public.durant_proposals language plpgsql security definer set search_path = public
as $$
declare p public.durant_proposals; d jsonb;
begin
  select * into p from public.durant_proposals where id = target_proposal_id for update;
  if p.id is null or not public.has_shop_role(p.shop_id, array['admin','manager']::public.staff_role[]) then raise exception 'not authorized'; end if;
  if p.status <> 'ready' then raise exception 'proposal is not ready'; end if;
  d := p.proposed_data;
  update public.work_orders set
    items = coalesce(d->'items', items),
    labor_cost = coalesce((d->>'laborCost')::numeric, labor_cost),
    part_costs = coalesce((d->>'partCosts')::numeric, part_costs),
    totals = coalesce(d->'totals', totals),
    diagnostic_selection = coalesce(d->'diagnosticSelection', diagnostic_selection),
    durant_full_transfer = coalesce((d->>'durantFullTransfer')::boolean, durant_full_transfer),
    updated_at = now()
  where id = p.work_order_id;
  update public.durant_proposals set status='approved', approved_at=now(), approved_by=auth.uid(), updated_at=now() where id=p.id returning * into p;
  insert into public.durant_history(shop_id, work_order_id, actor_user_id, event_type, summary, safe_data) values (p.shop_id,p.work_order_id,auth.uid(),'approved','GadgetBoy approved Durant changes',jsonb_build_object('proposalId',p.id));
  return p;
end;
$$;
revoke all on function public.approve_durant_proposal(uuid) from public;
grant execute on function public.approve_durant_proposal(uuid) to authenticated;
