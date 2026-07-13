create policy "active staff can read shop staff profiles"
on public.staff_profiles for select
to authenticated
using (public.is_active_shop_staff(shop_id));
