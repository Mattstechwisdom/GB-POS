alter table public.staff_profiles
add constraint staff_profiles_shop_id_legacy_id_key
unique (shop_id, legacy_id);
