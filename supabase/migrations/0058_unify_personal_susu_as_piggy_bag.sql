-- 0058_unify_personal_susu_as_piggy_bag.sql
-- Personal Susu and Piggy Bag are one customer product. Official payment type is piggy_bag.

update public.payment_transactions
set payment_type = 'piggy_bag',
    provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object(
      'legacy_payment_type', 'personal_susu',
      'normalized_payment_type', 'piggy_bag'
    ),
    updated_at = now()
where payment_type::text = 'personal_susu';

update public.wallet_transactions
set transaction_type = 'piggy_bag_deposit',
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'legacy_transaction_type', 'personal_susu_deposit',
      'payment_type', 'piggy_bag',
      'normalized_payment_type', 'piggy_bag'
    ),
    updated_at = now()
where transaction_type = 'personal_susu_deposit';

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.payment_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%payment_type%';

  if constraint_name is not null then
    execute format('alter table public.payment_transactions drop constraint %I', constraint_name);
  end if;

  alter table public.payment_transactions
    add constraint payment_transactions_payment_type_check
    check (payment_type in ('contribution', 'savings', 'piggy_bag', 'wallet_deposit'));
end $$;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.wallet_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%transaction_type%';

  if constraint_name is not null then
    execute format('alter table public.wallet_transactions drop constraint %I', constraint_name);
  end if;

  alter table public.wallet_transactions
    add constraint wallet_transactions_transaction_type_check
    check (
      transaction_type in (
        'deposit',
        'contribution_payment',
        'payout_received',
        'piggy_bag_deposit',
        'piggy_bag_withdrawal',
        'savings_deposit',
        'refund'
      )
    );
end $$;

create or replace function public.initiate_placeholder_payment(
  payment_type text,
  amount numeric,
  currency text default 'GHS',
  circle_id uuid default null,
  contribution_id uuid default null,
  provider_response jsonb default '{}'::jsonb
)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  allowed_types text[] := array['contribution', 'savings', 'piggy_bag', 'wallet_deposit'];
  target_contribution public.contributions;
  target_circle public.circles;
  created_transaction public.payment_transactions;
  resolved_amount numeric := amount;
  resolved_currency text := coalesce(nullif(currency, ''), 'GHS');
  resolved_circle_id uuid := circle_id;
  reference text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  if payment_type is null or not (payment_type = any(allowed_types)) then
    raise exception 'Unsupported payment type';
  end if;

  if contribution_id is not null then
    select *
    into target_contribution
    from public.contributions
    where id = contribution_id;

    if target_contribution.id is null then
      raise exception 'Contribution not found';
    end if;

    if target_contribution.user_id <> current_user_id then
      raise exception 'You can only initiate payment for your own contribution';
    end if;

    if target_contribution.status::text in ('paid', 'processed') then
      raise exception 'This contribution is already paid';
    end if;

    resolved_circle_id := target_contribution.circle_id;
    resolved_amount := coalesce(target_contribution.amount_due, target_contribution.amount, amount);

    select *
    into target_circle
    from public.circles
    where id = target_contribution.circle_id;

    resolved_currency := coalesce(target_circle.base_currency::text, resolved_currency, 'GHS');
  end if;

  if resolved_amount is null or resolved_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  reference := 'SC' || to_char(now() at time zone 'UTC', 'YYMMDDHH24MI') || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  insert into public.payment_transactions (
    user_id,
    circle_id,
    contribution_id,
    amount,
    currency,
    payment_method,
    provider,
    provider_reference,
    status,
    payment_type,
    provider_response,
    created_at,
    updated_at
  )
  values (
    current_user_id,
    resolved_circle_id,
    contribution_id,
    resolved_amount,
    resolved_currency,
    'mobile_money',
    'hubtel',
    reference,
    'initiated',
    payment_type,
    jsonb_build_object(
      'mode', 'hubtel_collection',
      'message', 'Hubtel payment initiated. Balances update after Hubtel confirms success.',
      'real_collection_enabled', true,
      'money_movement_allowed', public.user_can_access_money_movement(current_user_id)
    ) || coalesce(provider_response, '{}'::jsonb),
    now(),
    now()
  )
  returning * into created_transaction;

  if contribution_id is not null then
    insert into public.contribution_payments (
      contribution_id,
      payment_transaction_id,
      user_id,
      circle_id,
      amount,
      status
    )
    values (
      contribution_id,
      created_transaction.id,
      current_user_id,
      resolved_circle_id,
      created_transaction.amount,
      created_transaction.status
    );

    update public.contributions
    set payment_reference = created_transaction.provider_reference,
        updated_at = now()
    where id = contribution_id;
  end if;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    current_user_id,
    'payment_initiated',
    'payment_transaction',
    created_transaction.id,
    'Customer initiated Hubtel payment.',
    jsonb_build_object(
      'payment_type', created_transaction.payment_type,
      'circle_id', created_transaction.circle_id,
      'contribution_id', created_transaction.contribution_id,
      'amount', created_transaction.amount,
      'currency', created_transaction.currency,
      'provider_reference', created_transaction.provider_reference,
      'mode', 'hubtel_collection'
    )
  );

  return created_transaction;
end;
$$;

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
  should_update_locked := target_transaction.payment_type in ('piggy_bag', 'savings');

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

  if target_transaction.payment_type = 'piggy_bag' then
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

drop function if exists public.get_customer_financial_summary();
drop function if exists public.get_customer_payment_breakdown();
drop function if exists public.get_customer_payment_history();

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
  currency text,
  susu_contributions numeric,
  savings_toward_susu numeric,
  piggy_savings numeric,
  wallet_deposits numeric,
  expected_payout_total numeric,
  pending_payments numeric,
  failed_payments numeric
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
  normalized_payments as (
    select
      pt.*,
      case
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('piggy_bag', 'piggy', 'piggy_box', 'piggybag')
          or lower(coalesce(pt.provider_response->>'legacy_payment_type', '')) = 'personal_susu'
          then 'piggy_bag'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('savings', 'saving', 'savings_plan')
          then 'savings'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('wallet_deposit', 'deposit')
          then 'wallet_deposit'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('contribution', 'susu_contribution', 'circle_contribution')
          then 'contribution'
        else lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_'))
      end as normalized_payment_type
    from public.payment_transactions pt
    where pt.user_id = auth.uid()
  ),
  normalized_wallet as (
    select
      wt.*,
      case
        when wt.transaction_type = 'piggy_bag_deposit'
          or lower(coalesce(wt.metadata->>'payment_type', '')) in ('piggy_bag', 'piggy', 'piggy box', 'piggy_box', 'piggybag')
          or lower(coalesce(wt.metadata->>'legacy_transaction_type', '')) = 'personal_susu_deposit'
          then 'piggy_bag'
        when wt.transaction_type = 'savings_deposit'
          then 'savings'
        when wt.transaction_type = 'contribution_payment'
          then 'contribution'
        when wt.transaction_type = 'deposit'
          then 'wallet_deposit'
        else wt.transaction_type
      end as normalized_payment_type
    from public.wallet_transactions wt
    where wt.user_id = auth.uid()
      and wt.status in ('successful', 'confirmed')
  ),
  expected_payouts as (
    select ps.*
    from public.payout_schedule ps
    join public.circle_members cm on cm.id = ps.member_id
    join public.circles c on c.id = ps.circle_id
    where cm.user_id = auth.uid()
      and cm.status = 'approved'
      and c.status = 'active'
      and ps.status in ('scheduled', 'pending', 'processing')
  ),
  received_legacy as (
    select coalesce(sum(amount), 0) amount
    from public.payouts
    where user_id = auth.uid()
      and status::text in ('completed', 'paid', 'successful')
  )
  select
    coalesce((select sum(amount) from normalized_payments where status = 'successful'), 0),
    coalesce((select sum(amount) from normalized_payments where status = 'successful' and normalized_payment_type in ('wallet_deposit', 'piggy_bag', 'savings')), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'contribution'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'piggy_bag'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'savings'), 0),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    greatest(
      coalesce((select sum(amount) from normalized_wallet where transaction_type = 'payout_received'), 0),
      coalesce((select amount from received_legacy), 0)
    ),
    coalesce((select currency from wallet), 'GHS'),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'contribution'), 0),
    0,
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'piggy_bag'), 0),
    coalesce((select sum(amount) from normalized_wallet where normalized_payment_type = 'wallet_deposit'), 0),
    coalesce((select sum(payout_amount) from expected_payouts), 0),
    coalesce((select sum(amount) from normalized_payments where status in ('initiated', 'pending')), 0),
    coalesce((select sum(amount) from normalized_payments where status in ('failed', 'cancelled', 'reversed')), 0);
$$;

create or replace function public.get_customer_payment_breakdown()
returns table (
  payment_type text,
  label text,
  confirmed_amount numeric,
  pending_amount numeric,
  failed_amount numeric,
  confirmed_count integer,
  pending_count integer,
  failed_count integer
)
language sql
security definer
set search_path = public
stable
as $$
  with normalized_payment_rows as (
    select
      pt.*,
      case
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('piggy_bag', 'piggy', 'piggy_box', 'piggybag')
          or lower(coalesce(pt.provider_response->>'legacy_payment_type', '')) = 'personal_susu'
          then 'piggy_bag'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('savings', 'saving', 'savings_plan')
          then 'savings'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('wallet_deposit', 'deposit')
          then 'wallet_deposit'
        when lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('contribution', 'susu_contribution', 'circle_contribution')
          then 'contribution'
        else lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_'))
      end as normalized_payment_type
    from public.payment_transactions pt
    where pt.user_id = auth.uid()
  ),
  normalized_wallet as (
    select
      wt.*,
      case
        when wt.transaction_type = 'piggy_bag_deposit'
          or lower(coalesce(wt.metadata->>'payment_type', '')) in ('piggy_bag', 'piggy', 'piggy box', 'piggy_box', 'piggybag')
          or lower(coalesce(wt.metadata->>'legacy_transaction_type', '')) = 'personal_susu_deposit'
          then 'piggy_bag'
        when wt.transaction_type = 'savings_deposit'
          then 'savings'
        when wt.transaction_type = 'contribution_payment'
          then 'contribution'
        when wt.transaction_type = 'deposit'
          then 'wallet_deposit'
        else wt.transaction_type
      end as normalized_payment_type
    from public.wallet_transactions wt
    where wt.user_id = auth.uid()
      and wt.status in ('successful', 'confirmed')
  ),
  pending_grouped as (
    select
      normalized_payment_type,
      sum(amount) filter (where status in ('initiated', 'pending')) as pending_amount,
      sum(amount) filter (where status in ('failed', 'cancelled', 'reversed')) as failed_amount,
      count(*) filter (where status in ('initiated', 'pending'))::integer as pending_count,
      count(*) filter (where status in ('failed', 'cancelled', 'reversed'))::integer as failed_count
    from normalized_payment_rows
    group by normalized_payment_type
  ),
  confirmed_grouped as (
    select
      normalized_payment_type,
      sum(amount) as confirmed_amount,
      count(*)::integer as confirmed_count
    from normalized_wallet
    group by normalized_payment_type
  ),
  normalized_types(payment_type, label) as (
    values
      ('contribution', 'Susu Contributions'),
      ('savings', 'Savings Plan'),
      ('piggy_bag', 'Piggy Bag'),
      ('wallet_deposit', 'Wallet Deposits')
  )
  select
    nt.payment_type,
    nt.label,
    coalesce(cg.confirmed_amount, 0),
    coalesce(pg.pending_amount, 0),
    coalesce(pg.failed_amount, 0),
    coalesce(cg.confirmed_count, 0),
    coalesce(pg.pending_count, 0),
    coalesce(pg.failed_count, 0)
  from normalized_types nt
  left join confirmed_grouped cg on cg.normalized_payment_type = nt.payment_type
  left join pending_grouped pg on pg.normalized_payment_type = nt.payment_type
  order by case nt.payment_type
    when 'contribution' then 1
    when 'piggy_bag' then 2
    when 'savings' then 3
    when 'wallet_deposit' then 4
    else 5
  end;
$$;

create or replace function public.get_customer_payment_history()
returns table (
  transaction_id uuid,
  wallet_transaction_id uuid,
  payment_type text,
  service_type text,
  amount numeric,
  currency text,
  status text,
  provider text,
  provider_reference text,
  receipt_id text,
  payment_method text,
  created_at timestamptz,
  completed_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    pt.id,
    wt.id,
    case
      when pt.payment_type::text = 'personal_susu' or pt.provider_response->>'legacy_payment_type' = 'personal_susu' then 'piggy_bag'
      else pt.payment_type::text
    end,
    case
      when pt.payment_type::text in ('piggy_bag', 'personal_susu') or pt.provider_response->>'legacy_payment_type' = 'personal_susu' then 'Piggy Bag'
      when pt.payment_type::text = 'contribution' then 'Circle contribution'
      when pt.payment_type::text = 'savings' then 'Savings plan'
      when pt.payment_type::text = 'wallet_deposit' then 'Wallet deposit'
      else initcap(replace(pt.payment_type::text, '_', ' '))
    end,
    pt.amount,
    pt.currency,
    case when pt.status = 'successful' then 'paid' else pt.status end,
    pt.provider,
    pt.provider_reference,
    wt.receipt_id,
    pt.payment_method,
    pt.created_at,
    case when pt.status = 'successful' then pt.updated_at else null end
  from public.payment_transactions pt
  left join public.wallet_transactions wt on wt.payment_transaction_id = pt.id and wt.status in ('successful', 'confirmed')
  where pt.user_id = auth.uid()
  order by pt.created_at desc;
$$;

notify pgrst, 'reload schema';
