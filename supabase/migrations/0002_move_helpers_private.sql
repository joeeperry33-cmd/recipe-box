-- Policy helpers live outside the API-exposed schema so they can't be called directly.
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_friend(uuid, uuid) set schema private;
alter function public.can_see_recipe(uuid, uuid) set schema private;
create or replace function private.can_see_recipe(r_id uuid, r_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select r_owner = auth.uid()
    or exists (select 1 from public.recipe_shares s where s.recipe_id = r_id and s.shared_with = auth.uid())
    or (private.is_friend(r_owner, auth.uid())
        and exists (select 1 from public.profiles p where p.id = r_owner and p.share_box));
$$;
