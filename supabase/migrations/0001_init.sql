-- Recipe Box schema: profiles, recipes, friends, sharing, meal plan, shopping list, photo storage.

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  display_name text not null default '',
  share_box boolean not null default false,  -- friends can see all of my recipes
  created_at timestamptz not null default now()
);
create unique index profiles_email_idx on public.profiles (lower(email));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- friendships ----------
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references public.profiles on delete cascade,
  addressee uuid not null references public.profiles on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
create unique index friendships_pair_idx on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index friendships_addressee_idx on public.friendships (addressee);

create function public.is_friend(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester = a and f.addressee = b) or (f.requester = b and f.addressee = a))
  );
$$;

-- ---------- recipes ----------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null,
  category text not null default 'Other',
  tags text[] not null default '{}',
  servings numeric,
  prep_time text not null default '',
  cook_time text not null default '',
  ingredients jsonb not null default '[]',  -- [{qty, unit, item, note, aisle}]
  steps jsonb not null default '[]',        -- ["step", ...]
  notes text not null default '',
  source text not null default '',
  photo_paths text[] not null default '{}',
  copied_from uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recipes_owner_idx on public.recipes (owner_id);

-- ---------- single-recipe shares ----------
create table public.recipe_shares (
  recipe_id uuid not null references public.recipes on delete cascade,
  shared_with uuid not null references public.profiles on delete cascade,
  shared_by uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, shared_with)
);
create index recipe_shares_with_idx on public.recipe_shares (shared_with);

create function public.can_see_recipe(r_id uuid, r_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select r_owner = auth.uid()
    or exists (select 1 from public.recipe_shares s where s.recipe_id = r_id and s.shared_with = auth.uid())
    or (public.is_friend(r_owner, auth.uid())
        and exists (select 1 from public.profiles p where p.id = r_owner and p.share_box));
$$;

-- ---------- per-person meal plan + shopping list ----------
create table public.meal_plans (
  user_id uuid primary key default auth.uid() references public.profiles on delete cascade,
  entries jsonb not null default '[]',      -- [{id, recipe_id, day, servings}]
  updated_at timestamptz not null default now()
);
create table public.shopping_lists (
  user_id uuid primary key default auth.uid() references public.profiles on delete cascade,
  items jsonb not null default '[]',        -- [{key, name, qty, unit, amount, aisle, from, have, got, manual}]
  updated_at timestamptz not null default now()
);

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_shares enable row level security;
alter table public.meal_plans enable row level security;
alter table public.shopping_lists enable row level security;

-- profiles: see yourself and anyone you have a friendship row with (pending or accepted)
create policy "profiles read" on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.friendships f
    where (f.requester = (select auth.uid()) and f.addressee = profiles.id)
       or (f.addressee = (select auth.uid()) and f.requester = profiles.id)));
create policy "profiles update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- friendships: both people can see and remove; only the addressee can accept
create policy "friendships read" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
create policy "friendships accept" on public.friendships for update to authenticated
  using (addressee = (select auth.uid())) with check (addressee = (select auth.uid()) and status = 'accepted');
create policy "friendships delete" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));

-- recipes: owner writes; owner, shared-with people and box-sharing friends read
create policy "recipes read" on public.recipes for select to authenticated
  using (public.can_see_recipe(id, owner_id));
create policy "recipes insert own" on public.recipes for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "recipes update own" on public.recipes for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "recipes delete own" on public.recipes for delete to authenticated
  using (owner_id = (select auth.uid()));

-- recipe_shares: share your own recipe with a friend; either side can see or remove it
create policy "shares read" on public.recipe_shares for select to authenticated
  using ((select auth.uid()) in (shared_by, shared_with));
create policy "shares insert" on public.recipe_shares for insert to authenticated with check (
  shared_by = (select auth.uid())
  and exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid()))
  and public.is_friend((select auth.uid()), shared_with));
create policy "shares delete" on public.recipe_shares for delete to authenticated
  using ((select auth.uid()) in (shared_by, shared_with));

-- plan + list: yours only
create policy "plan own" on public.meal_plans for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "list own" on public.shopping_lists for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------- friend requests by email ----------
-- Returns 'sent', 'accepted' (they had already asked you), 'exists', 'self' or 'not_found'.
create function public.send_friend_request(friend_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  them uuid;
  existing public.friendships%rowtype;
begin
  if me is null then raise exception 'not signed in'; end if;
  select id into them from public.profiles where lower(email) = lower(trim(friend_email));
  if them is null then return 'not_found'; end if;
  if them = me then return 'self'; end if;
  select * into existing from public.friendships
    where least(requester, addressee) = least(me, them) and greatest(requester, addressee) = greatest(me, them);
  if found then
    if existing.status = 'pending' and existing.addressee = me then
      update public.friendships set status = 'accepted' where id = existing.id;
      return 'accepted';
    end if;
    return 'exists';
  end if;
  insert into public.friendships (requester, addressee) values (me, them);
  return 'sent';
end $$;
revoke execute on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.is_friend(uuid, uuid) from public, anon;
revoke execute on function public.can_see_recipe(uuid, uuid) from public, anon;
grant execute on function public.is_friend(uuid, uuid) to authenticated;
grant execute on function public.can_see_recipe(uuid, uuid) to authenticated;

-- ---------- photo storage (private; each person's own folder) ----------
insert into storage.buckets (id, name, public) values ('recipe-photos', 'recipe-photos', false)
  on conflict (id) do nothing;
create policy "photos read own" on storage.objects for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
