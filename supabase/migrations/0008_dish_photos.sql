-- A photo of the finished dish, separate from the recipe page scans.
-- Its own bucket, readable by link so friends and share links can show it; file names are random.
alter table public.recipes add column dish_photo text;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('dish-photos', 'dish-photos', true, 5242880, array['image/jpeg']) on conflict (id) do nothing;
create policy "dish photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dish photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'dish-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create or replace function public.get_shared_recipe(link_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', r.title, 'category', r.category, 'tags', r.tags, 'servings', r.servings,
    'prep_time', r.prep_time, 'cook_time', r.cook_time, 'ingredients', r.ingredients,
    'steps', r.steps, 'notes', r.notes, 'source', r.source, 'recipe_id', r.id, 'dish_photo', r.dish_photo,
    'shared_by', coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1)))
  from public.recipe_links l
  join public.recipes r on r.id = l.recipe_id
  join public.profiles p on p.id = l.created_by
  where l.token = link_token and length(link_token) >= 32;
$$;
