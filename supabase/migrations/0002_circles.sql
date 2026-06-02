-- 0002_circles.sql
-- Creates the circles table with row-level security policies for owners.

create type if not exists public.circle_status as enum ('active', 'paused', 'completed', 'cancelled');

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  goal_amount numeric,
  contribution_amount numeric,
  frequency text,
  start_date timestamptz,
  end_date timestamptz,
  status public.circle_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.circles enable row level security;

create policy "Circles: owners can manage their circles"
  on public.circles
  as permissive
  for all
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Circles: authenticated users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (auth.uid() = owner_id);
