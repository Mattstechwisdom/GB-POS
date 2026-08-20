alter table public.feedback_entries
  add column if not exists attachments jsonb not null default '[]'::jsonb;

alter table public.feedback_entries
  drop constraint if exists feedback_entries_attachments_array;

alter table public.feedback_entries
  add constraint feedback_entries_attachments_array
  check (jsonb_typeof(attachments) = 'array');
