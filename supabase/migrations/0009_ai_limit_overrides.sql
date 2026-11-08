-- Per-person daily AI limits that replace the default. Only the database owner can change them.
create table private.ai_limits (
  user_id uuid primary key references auth.users on delete cascade,
  max_per_day int not null check (max_per_day > 0),
  note text
);
revoke all on private.ai_limits from public, anon, authenticated;

create or replace function private.bump_ai_usage(uid uuid, max_per_day int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int; cap int;
begin
  select l.max_per_day into cap from private.ai_limits l where l.user_id = uid;
  insert into public.ai_usage (user_id, day, count) values (uid, current_date, 1)
  on conflict (user_id, day) do update set count = public.ai_usage.count + 1
  returning count into n;
  return n <= coalesce(cap, max_per_day);
end $$;

-- JP (the app owner) asked for no practical limit; 1000 a day stays as a runaway guard.
insert into private.ai_limits (user_id, max_per_day, note)
values ('1e9639f6-514d-41bb-a8e5-beea569cfdbd', 1000, 'JP, the app owner: lifted on request 2026-11-08');
