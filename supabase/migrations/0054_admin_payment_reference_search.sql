-- 0054_admin_payment_reference_search.sql
-- Adds direct Hubtel reference lookup for finance staff and records confirmed wallet ledger rows.

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.wallet_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%status%';

  if constraint_name is not null then
    execute format('alter table public.wallet_transactions drop constraint %I', constraint_name);
  end if;

  alter table public.wallet_transactions
    add constraint wallet_transactions_status_check
    check (status in ('pending', 'successful', 'confirmed', 'failed', 'cancelled'));
end $$;

create or replace function public.account_successful_payment(target_transaction public.payment_transactions)
returns public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  wallet public.wallet_accounts;
  created_wallet_transaction public.wallet_transactions;
  wallet_transaction_type text;
  wallet_direction text;
  should_update_available boolean := false;
  should_update_locked boolean := false;
  plan_id uuid;
begin
  insert into public.wallet_accounts (user_id, currency)
  values (target_transaction.user_id, coalesce(nullif(target_transaction.currency, ''), 'GHS'))
  on conflict (user_id)
  do update set updated_at = now()
  returning * into wallet;

  wallet_transaction_type := case target_transaction.payment_type
    when 'contribution' then 'contribution_payment'
    when 'piggy_bag' then 'piggy_bag_deposit'
    when 'personal_susu' then 'personal_susu_deposit'
    when 'savings' then 'savings_deposit'
    when 'wallet_deposit' then 'deposit'
    else 'deposit'
  end;

  wallet_direction := case target_transaction.payment_type
    when 'contribution' then 'outflow'
    when 'wallet_deposit' then 'inflow'
    else 'lock'
  end;

  should_update_available := target_transaction.payment_type = 'wallet_deposit';
  should_update_locked := target_transaction.payment_type in ('piggy_bag', 'personal_susu', 'savings');

  insert into public.wallet_transactions (
    wallet_id,
    user_id,
    circle_id,
    contribution_id,
    payment_transaction_id,
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
    target_transaction.user_id,
    target_transaction.circle_id,
    target_transaction.contribution_id,
    target_transaction.id,
    wallet_transaction_type,
    target_transaction.amount,
    target_transaction.currency,
    wallet_direction,
    'confirmed',
    coalesce(target_transaction.payment_method, 'mobile_money'),
    target_transaction.provider,
    coalesce(target_transaction.provider_reference, 'payment-' || target_transaction.id::text),
    'Confirmed Hubtel payment accounting entry.',
    jsonb_build_object(
      'payment_type', target_transaction.payment_type,
      'provider_reference', target_transaction.provider_reference
    ) || coalesce(target_transaction.provider_response, '{}'::jsonb)
  )
  on conflict (payment_transaction_id) where payment_transaction_id is not null
  do nothing
  returning * into created_wallet_transaction;

  if created_wallet_transaction.id is null then
    select *
    into created_wallet_transaction
    from public.wallet_transactions
    where payment_transaction_id = target_transaction.id
    limit 1;

    return created_wallet_transaction;
  end if;

  if should_update_available then
    update public.wallet_accounts
    set available_balance = available_balance + target_transaction.amount,
        updated_at = now()
    where id = wallet.id;
  elsif should_update_locked then
    update public.wallet_accounts
    set locked_balance = locked_balance + target_transaction.amount,
        updated_at = now()
    where id = wallet.id;
  end if;

  if target_transaction.payment_type in ('piggy_bag', 'personal_susu') then
    plan_id := nullif(coalesce(
      target_transaction.provider_response->>'planId',
      target_transaction.provider_response->>'plan_id'
    ), '')::uuid;

    if plan_id is not null then
      insert into public.personal_susu_deposits (
        plan_id,
        user_id,
        amount,
        payment_status,
        provider,
        transaction_reference,
        payment_transaction_id,
        deposited_at
      )
      values (
        plan_id,
        target_transaction.user_id,
        target_transaction.amount,
        'paid',
        target_transaction.provider,
        target_transaction.provider_reference,
        target_transaction.id,
        now()
      )
      on conflict (payment_transaction_id) where payment_transaction_id is not null
      do nothing;
    end if;
  end if;

  return created_wallet_transaction;
end;
$$;

create or replace function public.admin_find_hubtel_payment(check_provider_reference text)
returns table (
  id uuid,
  user_id uuid,
  circle_id uuid,
  contribution_id uuid,
  amount numeric,
  currency text,
  payment_method text,
  provider text,
  provider_reference text,
  status text,
  payment_type text,
  provider_response jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  user_name text,
  user_email text,
  circle_name text,
  wallet_transaction_id uuid,
  wallet_status text,
  receipt_id text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  staff_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select *
  into staff_profile
  from public.profiles
  where user_id = auth.uid();

  if staff_profile.user_id is null
    or staff_profile.account_status <> 'active'
    or staff_profile.role not in ('super_admin', 'finance')
  then
    raise exception 'Finance or Super Admin access required';
  end if;

  if nullif(trim(check_provider_reference), '') is null then
    raise exception 'Provider reference is required';
  end if;

  return query
  select
    pt.id,
    pt.user_id,
    pt.circle_id,
    pt.contribution_id,
    pt.amount,
    pt.currency,
    pt.payment_method,
    pt.provider,
    pt.provider_reference,
    pt.status,
    pt.payment_type,
    pt.provider_response,
    pt.created_at,
    pt.updated_at,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.name), ''), nullif(trim(p.email), '')),
    p.email,
    c.name,
    wt.id,
    wt.status,
    wt.receipt_id
  from public.payment_transactions pt
  left join public.profiles p on p.user_id = pt.user_id
  left join public.circles c on c.id = pt.circle_id
  left join public.wallet_transactions wt on wt.payment_transaction_id = pt.id
  where pt.provider = 'hubtel'
    and pt.provider_reference = trim(check_provider_reference)
  order by pt.created_at desc
  limit 1;
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
language sql
security definer
set search_path = public
stable
as $$
  with wallet as (
    select *
    from public.wallet_accounts
    where user_id = auth.uid()
    limit 1
  ),
  confirmed_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status in ('successful', 'confirmed')
  )
  select
    (select id from wallet),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    coalesce((select sum(amount) from confirmed_wallet where direction = 'inflow'), 0),
    coalesce((select sum(amount) from confirmed_wallet where direction = 'outflow'), 0),
    coalesce((select sum(amount) from confirmed_wallet where direction = 'inflow' and created_at >= date_trunc('month', now())), 0),
    coalesce((select sum(amount) from confirmed_wallet where direction = 'outflow' and created_at >= date_trunc('month', now())), 0),
    coalesce((select currency from wallet), 'GHS');
$$;

create or replace function public.get_customer_financial_summary()
returns table (
  total_paid numeric,
  total_deposited numeric,
  total_contributed numeric,
  piggy_balance numeric,
  savings_balance numeric,
  available_wallet_balance numeric,
  locked_balance numeric,
  total_received numeric,
  currency text
)
language sql
security definer
set search_path = public
stable
as $$
  with wallet as (
    select *
    from public.wallet_accounts
    where user_id = auth.uid()
    limit 1
  ),
  successful_payments as (
    select *
    from public.payment_transactions
    where user_id = auth.uid()
      and status = 'successful'
  ),
  confirmed_wallet as (
    select *
    from public.wallet_transactions
    where user_id = auth.uid()
      and status in ('successful', 'confirmed')
  )
  select
    coalesce((select sum(amount) from successful_payments), 0),
    coalesce((select sum(amount) from successful_payments where payment_type in ('wallet_deposit', 'piggy_bag', 'savings', 'personal_susu')), 0),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from public.contributions where user_id = auth.uid() and status::text in ('paid', 'processed')), 0),
    coalesce((select sum(amount) from confirmed_wallet where transaction_type = 'piggy_bag_deposit'), 0),
    coalesce((select sum(amount) from confirmed_wallet where transaction_type in ('savings_deposit', 'personal_susu_deposit')), 0),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    coalesce((select sum(amount) from confirmed_wallet where transaction_type = 'payout_received'), 0),
    coalesce((select currency from wallet), 'GHS');
$$;

notify pgrst, 'reload schema';
