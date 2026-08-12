alter table public.calendar_events
  add column if not exists task_completed boolean not null default false,
  add column if not exists task_completed_at timestamptz,
  add column if not exists task_completed_by text;

comment on column public.calendar_events.task_completed is
  'True after a technician completes a calendar checklist task.';

comment on column public.calendar_events.task_completed_at is
  'Timestamp of the most recent task completion.';

comment on column public.calendar_events.task_completed_by is
  'Display name of the technician associated with the completion.';

create index if not exists calendar_events_open_tasks_idx
  on public.calendar_events (shop_id, event_date)
  where category = 'task' and task_completed = false;
