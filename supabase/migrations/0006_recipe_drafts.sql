-- Results of the photo/web reader, kept so a read finishes even if the phone drops the connection.
create table public.recipe_drafts (
  id uuid primary key,
  user_id uuid not null references public.profiles on delete cascade,
  status text not null default 'working' check (status in ('working', 'done', 'error')),
  recipe jsonb,
  error text,
  photo_paths text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index recipe_drafts_user_idx on public.recipe_drafts (user_id);
alter table public.recipe_drafts enable row level security;
-- Only the reader (service role) writes; people can see and clear their own.
create policy "drafts read own" on public.recipe_drafts for select to authenticated using (user_id = (select auth.uid()));
create policy "drafts delete own" on public.recipe_drafts for delete to authenticated using (user_id = (select auth.uid()));
