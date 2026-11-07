-- Counts photo reads per person per day so one account can't run up the AI bill.
create table public.ai_usage (
  user_id uuid not null references auth.users on delete cascade,
  day date not null default current_date,
  count int not null default 0,
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;
-- No policies: only the server (service role) reads or writes this table.

create function private.bump_ai_usage(uid uuid, max_per_day int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  insert into public.ai_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into n;
  return n <= max_per_day;
end $$;
revoke execute on function private.bump_ai_usage(uuid, int) from public, anon, authenticated;

create function public.bump_ai_usage(uid uuid, max_per_day int) returns boolean
language sql security definer set search_path = '' as $$ select private.bump_ai_usage(uid, max_per_day) $$;
revoke execute on function public.bump_ai_usage(uuid, int) from public, anon, authenticated;
grant execute on function public.bump_ai_usage(uuid, int) to service_role;
