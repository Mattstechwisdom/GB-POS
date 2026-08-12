create table if not exists public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id text not null,
  subject text not null,
  body text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create index if not exists feedback_entries_shop_status_idx
  on public.feedback_entries(shop_id, completed, updated_at desc);

drop trigger if exists feedback_entries_set_updated_at on public.feedback_entries;
create trigger feedback_entries_set_updated_at
before update on public.feedback_entries
for each row execute function public.set_updated_at();

alter table public.feedback_entries enable row level security;
grant select, insert, update, delete on public.feedback_entries to authenticated;

drop policy if exists "active staff can read feedback entries" on public.feedback_entries;
create policy "active staff can read feedback entries"
on public.feedback_entries for select to authenticated
using (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can insert feedback entries" on public.feedback_entries;
create policy "active staff can insert feedback entries"
on public.feedback_entries for insert to authenticated
with check (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can update feedback entries" on public.feedback_entries;
create policy "active staff can update feedback entries"
on public.feedback_entries for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can delete feedback entries" on public.feedback_entries;
create policy "active staff can delete feedback entries"
on public.feedback_entries for delete to authenticated
using (public.is_active_shop_staff(shop_id));

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'feedback_entries'
  ) then
    alter publication supabase_realtime add table public.feedback_entries;
  end if;
end
$$;