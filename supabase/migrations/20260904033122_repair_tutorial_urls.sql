alter table public.repair_categories
  add column if not exists tutorial_url text,
  add column if not exists tutorial_media_type text,
  add column if not exists tutorial_updated_at timestamptz;

alter table public.repair_categories
  drop constraint if exists repair_categories_tutorial_url_length,
  add constraint repair_categories_tutorial_url_length
    check (tutorial_url is null or char_length(tutorial_url) <= 2048),
  drop constraint if exists repair_categories_tutorial_media_type,
  add constraint repair_categories_tutorial_media_type
    check (tutorial_media_type is null or tutorial_media_type in ('youtube', 'direct-video', 'webpage'));

comment on column public.repair_categories.tutorial_url is
  'Synchronized HTTPS tutorial URL. Video bytes are never stored by the POS.';
