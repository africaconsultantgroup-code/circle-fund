-- 0021_personal_susu_piggy_bag.sql
-- Adds locked personal susu savings plans and deposit records.

create table if not exists public.personal_susu_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(12, 2) not null check (target_amount > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  duration integer not null check (duration > 0),
  duration_unit text not null default 'months' check (duration_unit in ('weeks', 'months')),
  start_date date not null,
  end_date date not null,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  locked_until date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint personal_susu_plans_date_order check (end_date >= start_date and locked_until >= start_date)
);

create table if not exists public.personal_susu_deposits (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.personal_susu_plans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  provider text,
  transaction_reference text,
  deposited_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists personal_susu_plans_user_id_idx
  on public.personal_susu_plans(user_id, created_at desc);

create index if not exists personal_susu_deposits_plan_id_idx
  on public.personal_susu_deposits(plan_id, deposited_at desc);

create index if not exists personal_susu_deposits_user_id_idx
  on public.personal_susu_deposits(user_id, deposited_at desc);

alter table public.personal_susu_plans enable row level security;
alter table public.personal_susu_deposits enable row level security;

drop policy if exists "Personal susu plans: users can select own plans" on public.personal_susu_plans;
create policy "Personal susu plans: users can select own plans"
  on public.personal_susu_plans
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Personal susu plans: phone verified users can insert own plans" on public.personal_susu_plans;
create policy "Personal susu plans: phone verified users can insert own plans"
  on public.personal_susu_plans
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_has_verified_phone(auth.uid())
  );

drop policy if exists "Personal susu plans: users can update own plans" on public.personal_susu_plans;
create policy "Personal susu plans: users can update own plans"
  on public.personal_susu_plans
  as permissive
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Personal susu deposits: users can select own deposits" on public.personal_susu_deposits;
create policy "Personal susu deposits: users can select own deposits"
  on public.personal_susu_deposits
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Personal susu deposits: phone verified users can insert own deposits" on public.personal_susu_deposits;
create policy "Personal susu deposits: phone verified users can insert own deposits"
  on public.personal_susu_deposits
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_has_verified_phone(auth.uid())
    and exists (
      select 1
      from public.personal_susu_plans plan
      where plan.id = plan_id
        and plan.user_id = auth.uid()
        and plan.status = 'active'
    )
  );
