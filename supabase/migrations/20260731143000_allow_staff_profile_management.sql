grant insert, update, delete on public.staff_profiles to authenticated;

create policy "managers can insert shop staff profiles"
on public.staff_profiles for insert
to authenticated
with check (
  public.has_shop_role(
    shop_id,
    array['admin','manager']::public.staff_role[]
  )
);

create policy "managers can update shop staff profiles"
on public.staff_profiles for update
to authenticated
using (
  public.has_shop_role(
    shop_id,
    array['admin','manager']::public.staff_role[]
  )
)
with check (
  public.has_shop_role(
    shop_id,
    array['admin','manager']::public.staff_role[]
  )
);

create policy "managers can delete shop staff profiles"
on public.staff_profiles for delete
to authenticated
using (
  public.has_shop_role(
    shop_id,
    array['admin','manager']::public.staff_role[]
  )
);
