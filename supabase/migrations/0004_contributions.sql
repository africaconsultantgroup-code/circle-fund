-- 0004_contributions.sql
-- Creates contributions table with policies for contributors and circle owners.

create type if not exists public.contribution_status as enum ('pending', 'processed', 'failed');

create table if not exists public.contributions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  contribution_date timestamptz not null default now(),
  method text,
  status public.contribution_status not null default 'pending',
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.contributions enable row level security;

create policy "Contributions: users can select their own contributions"
  on public.contributions
  as permissive
  for select
  using (auth.uid() = user_id);

create policy "Contributions: circle owners can select contributions for owned circles"
  on public.contributions
  as permissive
  for select
  using (
    exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

create policy "Contributions: users can insert contributions for themselves"
  on public.contributions
  as permissive
  for insert
  with check (auth.uid() = user_id);

create policy "Contributions: owners can update contributions for owned circles"
  on public.contributions
  as permissive
  for update
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

create policy "Contributions: users can update their own contribution status"
  on public.contributions
  as permissive
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
