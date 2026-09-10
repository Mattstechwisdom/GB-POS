create table public.inventory_price_rules (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  supplier_domain text not null, selector_fingerprint text, source_kind text, approvals integer not null default 0,
  corrections integer not null default 0, updated_at timestamptz not null default now(), unique(shop_id, supplier_domain)
);
create table public.inventory_price_exceptions (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, selector_fingerprint text, source_kind text,
  detected_cost numeric(12,2), corrected_cost numeric(12,2), updated_at timestamptz not null default now(), unique(shop_id, product_id)
);
create table public.inventory_price_check_runs (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  status text not null default 'running' check(status in ('running','complete','failed')), total_items integer not null default 0,
  checked_items integer not null default 0, created_by uuid references auth.users(id), created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.inventory_price_check_results (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  run_id uuid not null references public.inventory_price_check_runs(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade, result_status text not null,
  previous_cost numeric(12,2) not null, detected_cost numeric(12,2), approved_cost numeric(12,2), source_url text,
  supplier_domain text, selector_fingerprint text, source_kind text, confidence numeric(5,4), warning text,
  review_status text not null default 'pending' check(review_status in ('pending','approved','skipped','reverted')),
  reviewed_by uuid references auth.users(id), reviewed_at timestamptz, created_at timestamptz not null default now(), unique(run_id, product_id)
);
create table public.inventory_cost_change_audits (
  id uuid primary key default gen_random_uuid(), shop_id uuid not null references public.shops(id) on delete cascade,
  result_id uuid not null references public.inventory_price_check_results(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict, previous_cost numeric(12,2) not null,
  detected_cost numeric(12,2), approved_cost numeric(12,2) not null, source_url text, selector_fingerprint text,
  corrected boolean not null default false, actor_user_id uuid references auth.users(id), created_at timestamptz not null default now(), reverted_at timestamptz, reverted_by uuid references auth.users(id)
);

alter table public.inventory_price_rules enable row level security;
alter table public.inventory_price_exceptions enable row level security;
alter table public.inventory_price_check_runs enable row level security;
alter table public.inventory_price_check_results enable row level security;
alter table public.inventory_cost_change_audits enable row level security;

do $$ declare t text; begin
  foreach t in array array['inventory_price_rules','inventory_price_exceptions','inventory_price_check_runs','inventory_price_check_results','inventory_cost_change_audits'] loop
    execute format('create policy "active staff manage %1$s" on public.%1$I for all to authenticated using (public.is_active_shop_staff(shop_id)) with check (public.is_active_shop_staff(shop_id))', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.approve_inventory_cost_change(p_result_id uuid, p_approved_cost numeric)
returns public.inventory_price_check_results language plpgsql security definer set search_path = public, pg_temp as $$
declare v_shop uuid; v_result public.inventory_price_check_results; v_previous numeric(12,2);
begin
  if p_approved_cost is null or p_approved_cost < 0 then raise exception 'Approved cost must be zero or greater'; end if;
  select shop_id into v_shop from public.staff_profiles where user_id = auth.uid() and status = 'active' limit 1;
  if v_shop is null then raise exception 'Active shop membership required'; end if;
  select * into v_result from public.inventory_price_check_results where id = p_result_id and shop_id = v_shop for update;
  if v_result.id is null then raise exception 'Price result not found'; end if;
  if v_result.review_status = 'approved' then return v_result; end if;
  select internal_cost into v_previous from public.products where id = v_result.product_id and shop_id = v_shop for update;
  insert into public.inventory_cost_change_audits(shop_id,result_id,product_id,previous_cost,detected_cost,approved_cost,source_url,selector_fingerprint,corrected,actor_user_id)
  values(v_shop,v_result.id,v_result.product_id,v_previous,v_result.detected_cost,p_approved_cost,v_result.source_url,v_result.selector_fingerprint,abs(coalesce(v_result.detected_cost, p_approved_cost)-p_approved_cost) >= .005,auth.uid());
  update public.products set internal_cost = p_approved_cost, updated_at = now() where id = v_result.product_id and shop_id = v_shop;
  update public.inventory_price_check_results set approved_cost=p_approved_cost,review_status='approved',reviewed_by=auth.uid(),reviewed_at=now() where id=v_result.id returning * into v_result;
  insert into public.inventory_price_exceptions(shop_id,product_id,selector_fingerprint,source_kind,detected_cost,corrected_cost)
  values(v_shop,v_result.product_id,v_result.selector_fingerprint,v_result.source_kind,v_result.detected_cost,p_approved_cost)
  on conflict(shop_id,product_id) do update set selector_fingerprint=excluded.selector_fingerprint,source_kind=excluded.source_kind,detected_cost=excluded.detected_cost,corrected_cost=excluded.corrected_cost,updated_at=now();
  return v_result;
end $$;
revoke all on function public.approve_inventory_cost_change(uuid,numeric) from public;
revoke all on function public.approve_inventory_cost_change(uuid,numeric) from anon;
grant execute on function public.approve_inventory_cost_change(uuid,numeric) to authenticated;
