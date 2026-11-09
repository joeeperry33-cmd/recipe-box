-- Meals people made: a personal cooking log that feeds cooking stats, and (when shared) the friends feed.
create table public.meals_made (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  recipe_id uuid references public.recipes on delete set null,
  title text not null check (length(title) between 1 and 200),   -- kept even if the recipe is deleted
  category text not null default '',
  photo text,                                                     -- path in the dish-photos bucket
  comment text not null default '' check (length(comment) <= 500),
  shared boolean not null default true,                          -- false = only in my own log and stats
  made_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index meals_made_user_idx on public.meals_made (user_id, made_on desc);
create index meals_made_recent_idx on public.meals_made (made_on desc);
alter table public.meals_made enable row level security;
create policy "meals read own or friends shared" on public.meals_made for select to authenticated
  using (user_id = (select auth.uid()) or (shared and private.is_friend(user_id, (select auth.uid()))));
create policy "meals insert own" on public.meals_made for insert to authenticated
  with check (user_id = (select auth.uid()) and (recipe_id is null or private.can_see_recipe(recipe_id, (select r.owner_id from public.recipes r where r.id = recipe_id))));
create policy "meals update own" on public.meals_made for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "meals delete own" on public.meals_made for delete to authenticated
  using (user_id = (select auth.uid()));
