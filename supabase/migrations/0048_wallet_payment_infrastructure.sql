-- 0048_wallet_payment_infrastructure.sql
-- Customer wallet ledger and placeholder payment flows. No live Hubtel calls.

create table if not exists public.wallet_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  available_balance numeric not null default 0,
  locked_balance numeric not null default 0,
  currency text not null default 'GHS',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  wallet_id uuid not null references public.wallet_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  contribution_id uuid references public.contributions(id) on delete set null,
  payout_schedule_id uuid references public.payout_schedule(id) on delete set null,
  transaction_type text not null check (
    transaction_type in (
      'deposit',
      'contribution_payment',
      'payout_received',
      'piggy_bag_deposit',
      'piggy_bag_withdrawal',
      'refund'
    )
  ),
  amount numeric not null,
  currency text not null default 'GHS',
  direction text not null check (direction in ('inflow', 'outflow', 'lock', 'unlock')),
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'cancelled')),
  payment_method text,
  provider text not null default 'placeholder',
  reference text not null unique default ('wallet-' || substr(gen_random_uuid()::text, 1, 12)),
  receipt_id text not null unique default ('RCT-' || upper(substr(gen_random_uuid()::text, 1, 10))),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wallet_accounts enable row level security;
alter table public.wallet_transactions enable row level security;

create index if not exists wallet_transactions_user_created_idx on public.wallet_transactions (user_id, created_at desc);
create index if not exists wallet_transactions_circle_idx on public.wallet_transactions (circle_id, created_at desc);
create index if not exists wallet_transactions_contribution_idx on public.wallet_transactions (contribution_id);
create index if not exists wallet_transactions_reference_idx on public.wallet_transactions (reference);

drop policy if exists "Wallet accounts: users can select own wallet" on public.wallet_accounts;
create policy "Wallet accounts: users can select own wallet"
  on public.wallet_accounts
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Wallet transactions: users can select own transactions" on public.wallet_transactions;
create policy "Wallet transactions: users can select own transactions"
  on public.wallet_transactions
  as permissive
  for select
  using (auth.uid() = user_id);

create or replace function public.ensure_wallet_account(check_user_id uuid, wallet_currency text default 'GHS')
returns public.wallet_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallet_accounts;
begin
  if auth.uid() is null or auth.uid() <> check_user_id then
    raise exception 'Authentication required';
  end if;

  insert into public.wallet_accounts (user_id, currency)
  values (check_user_id, coalesce(nullif(wallet_currency, ''), 'GHS'))
  on conflict (user_id)
  do update set updated_at = now()
  returning * into wallet;

  return wallet;
end;
$$;

create or replace function public.get_wallet_summary()
returns table (
  wallet_id uuid,
  available_balance numeric,
  locked_balance numeric,
  total_deposits numeric,
  total_withdrawals numeric,
  monthly_inflow numeric,
  monthly_outflow numeric,
  currency text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallet_accounts;
begin
  wallet := public.ensure_wallet_account(auth.uid(), 'GHS');

  return query
  select
    wallet.id,
    wallet.available_balance,
    wallet.locked_balance,
    coalesce(sum(wt.amount) filter (where wt.direction = 'inflow' and wt.status = 'successful'), 0),
    coalesce(sum(wt.amount) filter (where wt.direction = 'outflow' and wt.status = 'successful'), 0),
    coalesce(sum(wt.amount) filter (where wt.direction = 'inflow' and wt.status = 'successful' and wt.created_at >= date_trunc('month', now())), 0),
    coalesce(sum(wt.amount) filter (where wt.direction = 'outflow' and wt.status = 'successful' and wt.created_at >= date_trunc('month', now())), 0),
    wallet.currency
  from public.wallet_accounts wa
  left join public.wallet_transactions wt on wt.wallet_id = wallet.id
  where wa.id = wallet.id
  group by wallet.id, wallet.available_balance, wallet.locked_balance, wallet.currency;
end;
$$;

create or replace function public.prepare_wallet_deposit(
  amount numeric,
  payment_method text,
  currency text default 'GHS'
)
returns public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallet_accounts;
  created_transaction public.wallet_transactions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if amount is null or amount <= 0 then
    raise exception 'Deposit amount must be greater than 0';
  end if;

  if payment_method not in ('mtn_momo', 'telecel_cash', 'airteltigo_money') then
    raise exception 'Unsupported deposit method';
  end if;

  wallet := public.ensure_wallet_account(auth.uid(), coalesce(currency, 'GHS'));

  insert into public.wallet_transactions (
    wallet_id,
    user_id,
    transaction_type,
    amount,
    currency,
    direction,
    status,
    payment_method,
    provider,
    notes,
    metadata
  )
  values (
    wallet.id,
    auth.uid(),
    'deposit',
    amount,
    coalesce(nullif(currency, ''), wallet.currency),
    'inflow',
    'pending',
    payment_method,
    'hubtel_placeholder',
    'Wallet deposit prepared. Hubtel collections are not live yet.',
    jsonb_build_object('mode', 'placeholder', 'real_collection_enabled', false)
  )
  returning * into created_transaction;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'wallet_deposit_prepared',
    'wallet_transaction',
    created_transaction.id,
    'Customer prepared a wallet deposit. No live money moved.',
    jsonb_build_object(
      'amount', created_transaction.amount,
      'currency', created_transaction.currency,
      'payment_method', created_transaction.payment_method,
      'receipt_id', created_transaction.receipt_id
    )
  );

  return created_transaction;
end;
$$;

create or replace function public.pay_contribution_from_wallet(check_contribution_id uuid)
returns public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallet_accounts;
  target_contribution public.contributions;
  target_circle public.circles;
  payment_amount numeric;
  created_transaction public.wallet_transactions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_contribution
  from public.contributions
  where id = check_contribution_id;

  if target_contribution.id is null then
    raise exception 'Contribution not found';
  end if;

  if target_contribution.user_id <> auth.uid() then
    raise exception 'You can only pay your own contribution';
  end if;

  if target_contribution.status::text in ('paid', 'processed') then
    raise exception 'This contribution is already paid';
  end if;

  select *
  into target_circle
  from public.circles
  where id = target_contribution.circle_id;

  wallet := public.ensure_wallet_account(auth.uid(), coalesce(target_circle.base_currency::text, 'GHS'));
  payment_amount := coalesce(target_contribution.amount_due, target_contribution.amount);

  if wallet.available_balance < payment_amount then
    raise exception 'Insufficient available wallet balance';
  end if;

  update public.wallet_accounts
  set available_balance = available_balance - payment_amount,
      updated_at = now()
  where id = wallet.id;

  insert into public.wallet_transactions (
    wallet_id,
    user_id,
    circle_id,
    contribution_id,
    transaction_type,
    amount,
    currency,
    direction,
    status,
    payment_method,
    provider,
    notes,
    metadata
  )
  values (
    wallet.id,
    auth.uid(),
    target_contribution.circle_id,
    target_contribution.id,
    'contribution_payment',
    payment_amount,
    coalesce(target_circle.base_currency::text, wallet.currency),
    'outflow',
    'successful',
    'sika_wallet',
    'wallet',
    'Contribution paid from Sika Wallet.',
    jsonb_build_object('circle_name', target_circle.name)
  )
  returning * into created_transaction;

  update public.contributions
  set status = 'paid'::public.contribution_status,
      paid_at = now(),
      payment_reference = created_transaction.reference,
      updated_at = now()
  where id = target_contribution.id;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'wallet_contribution_payment',
    'wallet_transaction',
    created_transaction.id,
    'Customer paid a contribution from Sika Wallet.',
    jsonb_build_object(
      'circle_id', created_transaction.circle_id,
      'contribution_id', created_transaction.contribution_id,
      'amount', created_transaction.amount,
      'receipt_id', created_transaction.receipt_id
    )
  );

  return created_transaction;
end;
$$;

create or replace function public.receive_payout_to_wallet(check_schedule_id uuid)
returns public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_schedule public.payout_schedule;
  target_member public.circle_members;
  target_circle public.circles;
  wallet public.wallet_accounts;
  created_transaction public.wallet_transactions;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into target_schedule
  from public.payout_schedule
  where id = check_schedule_id;

  if target_schedule.id is null then
    raise exception 'Payout schedule not found';
  end if;

  select *
  into target_member
  from public.circle_members
  where id = target_schedule.member_id;

  if target_member.user_id <> auth.uid() then
    raise exception 'You can only receive your own payout';
  end if;

  select *
  into target_circle
  from public.circles
  where id = target_schedule.circle_id;

  wallet := public.ensure_wallet_account(auth.uid(), coalesce(target_circle.base_currency::text, 'GHS'));

  update public.wallet_accounts
  set available_balance = available_balance + coalesce(target_schedule.payout_amount, 0),
      updated_at = now()
  where id = wallet.id;

  insert into public.wallet_transactions (
    wallet_id,
    user_id,
    circle_id,
    payout_schedule_id,
    transaction_type,
    amount,
    currency,
    direction,
    status,
    payment_method,
    provider,
    reference,
    notes,
    metadata
  )
  values (
    wallet.id,
    auth.uid(),
    target_schedule.circle_id,
    target_schedule.id,
    'payout_received',
    coalesce(target_schedule.payout_amount, 0),
    coalesce(target_circle.base_currency::text, wallet.currency),
    'inflow',
    'successful',
    'sika_wallet',
    'wallet',
    coalesce(target_schedule.payout_reference, 'wallet-payout-' || substr(gen_random_uuid()::text, 1, 10)),
    'Payout received into Sika Wallet placeholder ledger.',
    jsonb_build_object('circle_name', target_circle.name)
  )
  returning * into created_transaction;

  update public.payout_schedule
  set status = 'paid',
      payout_reference = created_transaction.reference,
      updated_at = now()
  where id = target_schedule.id;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'wallet_payout_received',
    'wallet_transaction',
    created_transaction.id,
    'Customer payout was recorded in Sika Wallet.',
    jsonb_build_object(
      'circle_id', created_transaction.circle_id,
      'payout_schedule_id', created_transaction.payout_schedule_id,
      'amount', created_transaction.amount,
      'receipt_id', created_transaction.receipt_id
    )
  );

  return created_transaction;
end;
$$;

notify pgrst, 'reload schema';
