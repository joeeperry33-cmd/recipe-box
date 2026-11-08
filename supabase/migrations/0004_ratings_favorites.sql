-- Each person's own star rating (1-5) and favorite flag for any recipe they can see.
create table public.recipe_marks (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  favorite boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);
create index recipe_marks_recipe_idx on public.recipe_marks(recipe_id);
alter table public.recipe_marks enable row level security;

create policy "read own marks" on public.recipe_marks for select to authenticated
  using (user_id = (select auth.uid()));
-- The recipes subquery runs under the caller's own recipe policies, so only visible recipes can be marked.
create policy "add own marks" on public.recipe_marks for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "change own marks" on public.recipe_marks for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and exists (select 1 from public.recipes r where r.id = recipe_id));
create policy "remove own marks" on public.recipe_marks for delete to authenticated
  using (user_id = (select auth.uid()));
