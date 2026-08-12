create table if not exists public.calendar_notes (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  legacy_id text not null,
  note_date date not null,
  subject text not null,
  body text not null,
  legacy_created_at timestamptz,
  legacy_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shop_id, legacy_id)
);

create index if not exists calendar_notes_shop_date_idx
  on public.calendar_notes(shop_id, note_date desc);

drop trigger if exists calendar_notes_set_updated_at on public.calendar_notes;
create trigger calendar_notes_set_updated_at
before update on public.calendar_notes
for each row execute function public.set_updated_at();

alter table public.calendar_notes enable row level security;
grant select, insert, update, delete on public.calendar_notes to authenticated;

drop policy if exists "active staff can read calendar notes" on public.calendar_notes;
create policy "active staff can read calendar notes"
on public.calendar_notes for select to authenticated
using (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can insert calendar notes" on public.calendar_notes;
create policy "active staff can insert calendar notes"
on public.calendar_notes for insert to authenticated
with check (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can update calendar notes" on public.calendar_notes;
create policy "active staff can update calendar notes"
on public.calendar_notes for update to authenticated
using (public.is_active_shop_staff(shop_id))
with check (public.is_active_shop_staff(shop_id));

drop policy if exists "active staff can delete calendar notes" on public.calendar_notes;
create policy "active staff can delete calendar notes"
on public.calendar_notes for delete to authenticated
using (public.is_active_shop_staff(shop_id));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'calendar_notes'
  ) then
    alter publication supabase_realtime add table public.calendar_notes;
  end if;
end
$$;
