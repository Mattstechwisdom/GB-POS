alter table public.calendar_events
  add column if not exists recurrence_rule jsonb;

comment on column public.calendar_events.recurrence_rule is
  'Optional normalized recurrence rule for a manually-created calendar series.';

create index if not exists calendar_events_recurring_idx
  on public.calendar_events (shop_id, event_date)
  where recurrence_rule is not null;
