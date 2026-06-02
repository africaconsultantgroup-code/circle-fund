-- 0006_transactions.sql
-- Creates transaction records with policies for users and circle owners.

create type if not exists public.transaction_type as enum ('contribution', 'payout', 'refund', 'fee', 'adjustment');
create type if not exists public.transaction_status as enum ('pending', 'completed', 'failed');

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  type public.transaction_type not null,
  amount numeric not null,
  currency text not null default 'GHS',
  status public.transaction_status not null default 'pending',
  description text,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions enable row level security;

create policy "Transactions: users can select their own transactions"
  on public.transactions
  as permissive
  for select
  using (auth.uid() = user_id);

create policy "Transactions: circle owners can select transactions for owned circles"
  on public.transactions
  as permissive
  for select
  using (
    circle_id is not null and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );

create policy "Transactions: users can insert their own transactions"
  on public.transactions
  as permissive
  for insert
  with check (auth.uid() = user_id);

create policy "Transactions: circle owners can update transactions for owned circles"
  on public.transactions
  as permissive
  for update
  using (
    circle_id is not null and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  )
  with check (
    circle_id is not null and exists (
      select 1 from public.circles c
      where c.id = circle_id and c.owner_id = auth.uid()
    )
  );
