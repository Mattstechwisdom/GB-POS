alter table public.calendar_events
  add column if not exists request_status text,
  add column if not exists shift_request_off boolean,
  add column if not exists requested_at timestamptz,
  add column if not exists reviewed_at timestamptz;

alter table public.calendar_events
  drop constraint if exists calendar_events_request_status_check;

alter table public.calendar_events
  add constraint calendar_events_request_status_check
  check (request_status is null or request_status in ('pending', 'approved', 'declined'));

create index if not exists calendar_events_pending_shift_requests_idx
  on public.calendar_events (shop_id, event_date)
  where source = 'shift-request' and request_status = 'pending';

comment on column public.calendar_events.request_status is
  'Review state for a technician time-off or dated shift-change request.';

comment on column public.calendar_events.shift_request_off is
  'True when the technician requested the full selected date off.';
