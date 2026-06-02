-- 0003_circle_members.sql
-- Creates circle membership records with policies for members and circle owners.

create table if not exists public.circle_members (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'pending',
  joined_at timestamptz not null default now(),
  invited_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, user_id)
);

alter table public.circle_members enable row level security;

create policy "Circle members: users can select their own membership"
  on public.circle_members
  as permissive
  for select
  using (auth.uid() = user_id);

create policy "Circle owners: can select membership in owned circles"
  on public.circle_members
  as permissive
  for select
  using (
    exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

create policy "Circle members: users can insert their own membership"
  on public.circle_members
  as permissive
  for insert
  with check (auth.uid() = user_id);

create policy "Circle owners: can manage membership in owned circles"
  on public.circle_members
  as permissive
  for update, delete
  using (
    exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

create policy "Circle members: users can update their own membership status"
  on public.circle_members
  as permissive
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
