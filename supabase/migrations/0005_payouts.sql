-- 0005_payouts.sql
-- Creates payouts table with row-level security for users and circle owners.

create type if not exists public.payout_status as enum ('pending', 'completed', 'failed');

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  payout_date timestamptz not null default now(),
  status public.payout_status not null default 'pending',
  method text,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.payouts enable row level security;

create policy "Payouts: users can select their own payouts"
  on public.payouts
  as permissive
  for select
  using (auth.uid() = user_id);

create policy "Payouts: circle owners can select payouts for owned circles"
  on public.payouts
  as permissive
  for select
  using (
    exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

create policy "Payouts: circle owners can insert payouts for owned circles"
  on public.payouts
  as permissive
  for insert
  with check (
    exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

create policy "Payouts: circle owners can update payout records"
  on public.payouts
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
