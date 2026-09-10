do $$ begin
  alter publication supabase_realtime add table public.client_responses;
exception when duplicate_object then null;
end $$;
