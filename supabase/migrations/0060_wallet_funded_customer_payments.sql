-- 0060_wallet_funded_customer_payments.sql
-- Allows customers to pay eligible obligations from available SikaCircle Wallet balance.

create or replace function public.pay_from_wallet(
  payment_type text,
  amount numeric default null,
  currency text default 'GHS',
  circle_id uuid default null,
  contribution_id uuid default null,
  plan_id uuid default null,
  metadata jsonb default '{}'::jsonb
)
returns public.wallet_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_type text;
  wallet public.wallet_accounts;
  target_contribution public.contributions;
  target_circle public.circles;
  target_plan public.personal_susu_plans;
  payment_amount numeric := amount;
  resolved_currency text := coalesce(nullif(currency, ''), 'GHS');
  resolved_circle_id uuid := circle_id;
  resolved_contribution_id uuid := contribution_id;
  wallet_transaction_type text;
  wallet_direction text;
  created_transaction public.wallet_transactions;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  normalized_type := case
    when lower(replace(coalesce(payment_type, ''), ' ', '_')) in ('contribution', 'susu_contribution', 'circle_contribution') then 'contribution'
    when lower(replace(coalesce(payment_type, ''), ' ', '_')) in ('piggy_bag', 'piggy', 'piggy_box', 'piggybag') then 'piggy_bag'
    when lower(replace(coalesce(payment_type, ''), ' ', '_')) in ('savings', 'saving', 'savings_plan') then 'savings'
    else lower(replace(coalesce(payment_type, ''), ' ', '_'))
  end;

  if normalized_type not in ('contribution', 'piggy_bag', 'savings') then
    raise exception 'Unsupported wallet payment type';
  end if;

  if normalized_type = 'contribution' then
    if contribution_id is null then
      raise exception 'Contribution is required';
    end if;

    select *
    into target_contribution
    from public.contributions
    where id = contribution_id
    for update;

    if target_contribution.id is null then
      raise exception 'Contribution not found';
    end if;

    if target_contribution.user_id <> current_user_id then
      raise exception 'You can only pay your own contribution';
    end if;

    if target_contribution.status::text in ('paid', 'processed') then
      raise exception 'This contribution is already paid';
    end if;

    select *
    into target_circle
    from public.circles
    where id = target_contribution.circle_id;

    resolved_circle_id := target_contribution.circle_id;
    resolved_contribution_id := target_contribution.id;
    payment_amount := coalesce(target_contribution.amount_due, target_contribution.amount, payment_amount);
    resolved_currency := coalesce(target_circle.base_currency::text, resolved_currency, 'GHS');
    wallet_transaction_type := 'contribution_payment';
    wallet_direction := 'outflow';
  elsif normalized_type = 'piggy_bag' then
    if plan_id is not null then
      select *
      into target_plan
      from public.personal_susu_plans
      where id = plan_id
      for update;

      if target_plan.id is null then
        raise exception 'Piggy Bag plan not found';
      end if;

      if target_plan.user_id <> current_user_id then
        raise exception 'You can only fund your own Piggy Bag';
      end if;
    end if;

    wallet_transaction_type := 'piggy_bag_deposit';
    wallet_direction := 'lock';
  else
    wallet_transaction_type := 'savings_deposit';
    wallet_direction := 'lock';
  end if;

  if payment_amount is null or payment_amount <= 0 then
    raise exception 'Payment amount must be greater than 0';
  end if;

  select *
  into wallet
  from public.wallet_accounts
  where user_id = current_user_id
  for update;

  if wallet.id is null then
    insert into public.wallet_accounts (user_id, currency)
    values (current_user_id, resolved_currency)
    returning * into wallet;
  end if;

  if wallet.available_balance < payment_amount then
    raise exception 'Insufficient available balance. Please fund your wallet.';
  end if;

  update public.wallet_accounts
  set available_balance = available_balance - payment_amount,
      locked_balance = case when wallet_direction = 'lock' then locked_balance + payment_amount else locked_balance end,
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
    current_user_id,
    resolved_circle_id,
    resolved_contribution_id,
    wallet_transaction_type,
    payment_amount,
    coalesce(resolved_currency, wallet.currency, 'GHS'),
    wallet_direction,
    'confirmed',
    'sika_wallet',
    'wallet',
    case
      when normalized_type = 'contribution' then 'Contribution paid from SikaCircle Wallet.'
      when normalized_type = 'piggy_bag' then 'Piggy Bag funded from SikaCircle Wallet.'
      else 'Savings plan funded from SikaCircle Wallet.'
    end,
    jsonb_build_object(
      'payment_type', normalized_type,
      'plan_id', plan_id,
      'source', 'sika_wallet'
    ) || coalesce(metadata, '{}'::jsonb)
  )
  returning * into created_transaction;

  if normalized_type = 'contribution' then
    update public.contributions
    set status = 'paid'::public.contribution_status,
        paid_at = now(),
        payment_reference = created_transaction.reference,
        updated_at = now()
    where id = target_contribution.id;
  elsif normalized_type = 'piggy_bag' and plan_id is not null then
    insert into public.personal_susu_deposits (
      plan_id,
      user_id,
      amount,
      payment_status,
      provider,
      transaction_reference,
      deposited_at
    )
    values (
      plan_id,
      current_user_id,
      payment_amount,
      'paid',
      'wallet',
      created_transaction.reference,
      now()
    );
  end if;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    current_user_id,
    'wallet_payment',
    'wallet_transaction',
    created_transaction.id,
    case
      when normalized_type = 'contribution' then 'Customer paid contribution from SikaCircle Wallet.'
      when normalized_type = 'piggy_bag' then 'Customer funded Piggy Bag from SikaCircle Wallet.'
      else 'Customer funded savings plan from SikaCircle Wallet.'
    end,
    jsonb_build_object(
      'payment_type', normalized_type,
      'amount', payment_amount,
      'currency', resolved_currency,
      'circle_id', resolved_circle_id,
      'contribution_id', resolved_contribution_id,
      'plan_id', plan_id,
      'receipt_id', created_transaction.receipt_id
    )
  );

  return created_transaction;
end;
$$;

create or replace function public.pay_contribution_from_wallet(check_contribution_id uuid)
returns public.wallet_transactions
language sql
security definer
set search_path = public
as $$
  select public.pay_from_wallet('contribution', null, 'GHS', null, check_contribution_id, null, '{}'::jsonb);
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
  ),
  paid_into_sikacircle as (
    select *
    from confirmed_wallet
    where provider <> 'wallet'
      and transaction_type in (
        'deposit',
        'contribution_payment',
        'piggy_bag_deposit',
        'savings_deposit'
      )
  ),
  withdrawn_or_paid_out as (
    select *
    from confirmed_wallet
    where transaction_type in (
      'piggy_bag_withdrawal',
      'refund'
    )
      or direction in ('outflow', 'unlock')
  )
  select
    (select id from wallet),
    coalesce((select available_balance from wallet), 0),
    coalesce((select locked_balance from wallet), 0),
    coalesce((select sum(amount) from paid_into_sikacircle), 0),
    coalesce((select sum(amount) from withdrawn_or_paid_out), 0),
    coalesce((select sum(amount) from paid_into_sikacircle where created_at >= date_trunc('month', now())), 0),
    coalesce((select sum(amount) from withdrawn_or_paid_out where created_at >= date_trunc('month', now())), 0),
    coalesce((select currency from wallet), 'GHS');
$$;

notify pgrst, 'reload schema';
