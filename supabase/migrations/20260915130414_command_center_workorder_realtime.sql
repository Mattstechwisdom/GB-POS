-- Publish work-order changes without changing existing staff-only RLS policies.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'work_orders'
  ) then
    alter publication supabase_realtime add table public.work_orders;
  end if;
end;
$$;
