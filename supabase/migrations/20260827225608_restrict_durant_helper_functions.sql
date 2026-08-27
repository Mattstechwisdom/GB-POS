revoke all on function public.is_active_shop_staff(uuid) from public;
revoke all on function public.is_active_shop_staff(uuid) from anon;
revoke all on function public.is_durant_partner(uuid) from public;
revoke all on function public.is_durant_partner(uuid) from anon;

grant execute on function public.is_active_shop_staff(uuid) to authenticated;
grant execute on function public.is_durant_partner(uuid) to authenticated;
