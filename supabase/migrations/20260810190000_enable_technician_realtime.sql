do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'staff_profiles'
  ) then
    alter publication supabase_realtime add table public.staff_profiles;
  end if;
end
$$;
