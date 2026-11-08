-- Share links: a hard-to-guess token that lets anyone with the link read one recipe, even without an account.
create table public.recipe_links (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  recipe_id uuid not null references public.recipes on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now()
);
create index recipe_links_recipe_idx on public.recipe_links (recipe_id);
alter table public.recipe_links enable row level security;
create policy "links read own" on public.recipe_links for select to authenticated
  using (created_by = (select auth.uid()));
create policy "links create for own recipes" on public.recipe_links for insert to authenticated with check (
  created_by = (select auth.uid())
  and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));
create policy "links delete own" on public.recipe_links for delete to authenticated
  using (created_by = (select auth.uid()));

-- Reads the recipe behind a link. Open to signed-out visitors on purpose; the token is the key.
-- Leaves out the owner's id and private photo paths.
create function public.get_shared_recipe(link_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', r.title, 'category', r.category, 'tags', r.tags, 'servings', r.servings,
    'prep_time', r.prep_time, 'cook_time', r.cook_time, 'ingredients', r.ingredients,
    'steps', r.steps, 'notes', r.notes, 'source', r.source, 'recipe_id', r.id,
    'shared_by', coalesce(nullif(p.display_name, ''), split_part(p.email, '@', 1)))
  from public.recipe_links l
  join public.recipes r on r.id = l.recipe_id
  join public.profiles p on p.id = l.created_by
  where l.token = link_token and length(link_token) >= 32;
$$;
revoke all on function public.get_shared_recipe(text) from public;
grant execute on function public.get_shared_recipe(text) to anon, authenticated;

-- Recipe requests: ask a friend for a recipe; they answer by sharing one or saying they don't have it.
create table public.recipe_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null default auth.uid() references public.profiles on delete cascade,
  to_user uuid not null references public.profiles on delete cascade,
  note text not null check (length(note) between 1 and 300),
  status text not null default 'open' check (status in ('open', 'sent', 'declined')),
  recipe_id uuid references public.recipes on delete set null,
  created_at timestamptz not null default now(),
  answered_at timestamptz
);
create index recipe_requests_to_idx on public.recipe_requests (to_user);
create index recipe_requests_from_idx on public.recipe_requests (from_user);
create index recipe_requests_recipe_idx on public.recipe_requests (recipe_id);
alter table public.recipe_requests enable row level security;
create policy "requests read" on public.recipe_requests for select to authenticated
  using ((select auth.uid()) in (from_user, to_user));
create policy "requests send to friends" on public.recipe_requests for insert to authenticated with check (
  from_user = (select auth.uid()) and status = 'open' and recipe_id is null
  and private.is_friend((select auth.uid()), to_user));
-- Only the friend who was asked can answer, and only with one of their own recipes.
create policy "requests answer" on public.recipe_requests for update to authenticated
  using (to_user = (select auth.uid()))
  with check (to_user = (select auth.uid())
    and (recipe_id is null or exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid()))));
create policy "requests remove" on public.recipe_requests for delete to authenticated
  using ((select auth.uid()) in (from_user, to_user));
-- The asker can't rewrite the note or status after sending: only answer-related columns are updatable.
revoke update on public.recipe_requests from authenticated;
grant update (status, recipe_id, answered_at) on public.recipe_requests to authenticated;
