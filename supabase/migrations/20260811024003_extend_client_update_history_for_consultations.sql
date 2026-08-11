alter table public.client_update_history
  drop constraint if exists client_update_history_record_type_check;

alter table public.client_update_history
  add constraint client_update_history_record_type_check
  check (record_type in ('repair', 'sale', 'consult'));

alter table public.calendar_events
  add column if not exists status_update text,
  add column if not exists status_updated_at timestamptz,
  add column if not exists estimated_date text,
  add column if not exists tech_notes text,
  add column if not exists last_update_note text,
  add column if not exists last_update_at timestamptz;
