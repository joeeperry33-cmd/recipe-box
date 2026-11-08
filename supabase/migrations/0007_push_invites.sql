-- Phone notifications: one row per device that turned them on.
create table public.push_subscriptions (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push own select" on public.push_subscriptions for select to authenticated using (user_id = (select auth.uid()));
create policy "push own insert" on public.push_subscriptions for insert to authenticated with check (user_id = (select auth.uid()));
create policy "push own update" on public.push_subscriptions for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "push own delete" on public.push_subscriptions for delete to authenticated using (user_id = (select auth.uid()));

-- Email invites sent through the app, to cap them per person per day. Only the server function uses it.
create table public.invite_log (
  id bigint generated always as identity primary key,
  from_user uuid not null references public.profiles on delete cascade,
  email text not null,
  created_at timestamptz not null default now()
);
create index invite_log_from_idx on public.invite_log (from_user, created_at);
alter table public.invite_log enable row level security;

-- Notification keys, made by the `friends` function on first use. Only the service role can read them.
create table private.push_keys (
  id int primary key default 1 check (id = 1),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now()
);
revoke all on private.push_keys from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert on private.push_keys to service_role;
create function public.get_push_keys() returns table (public_key text, private_key text)
language sql security definer set search_path = '' as $$ select public_key, private_key from private.push_keys where id = 1 $$;
create function public.save_push_keys(pub text, priv text) returns void
language sql security definer set search_path = '' as $$ insert into private.push_keys (public_key, private_key) values (pub, priv) on conflict (id) do nothing $$;
revoke execute on function public.get_push_keys() from public, anon, authenticated;
revoke execute on function public.save_push_keys(text, text) from public, anon, authenticated;
grant execute on function public.get_push_keys() to service_role;
grant execute on function public.save_push_keys(text, text) to service_role;
