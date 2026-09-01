alter table public.repair_categories
  add column if not exists compatible_devices jsonb not null default '[]'::jsonb;

alter table public.repair_categories
  drop constraint if exists repair_categories_compatible_devices_array;

alter table public.repair_categories
  add constraint repair_categories_compatible_devices_array
  check (jsonb_typeof(compatible_devices) = 'array');
