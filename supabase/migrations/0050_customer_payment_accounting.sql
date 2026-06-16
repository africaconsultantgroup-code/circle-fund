-- 0050_customer_payment_accounting.sql
-- Makes confirmed Hubtel callbacks the source of truth for customer payment accounting.

alter table public.payment_transactions
  add column if not exists payment_type text not null default 'contribution';

alter table public.wallet_transactions
  add column if not exists payment_transaction_id uuid references public.payment_transactions(id) on delete set null;

alter table public.personal_susu_deposits
  add column if not exists payment_transaction_id uuid references public.payment_transactions(id) on delete set null;

create unique index if not exists wallet_transactions_payment_transaction_id_key
  on public.wallet_transactions(payment_transaction_id)
  where payment_transaction_id is not null;

create unique index if not exists personal_susu_deposits_payment_transaction_id_key
  on public.personal_susu_deposits(payment_transaction_id)
  where payment_transaction_id is not null;

create index if not exists wallet_transactions_payment_type_metadata_idx
  on public.wallet_transactions ((metadata->>'payment_type'), created_at desc);

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.payment_transactions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%payment_type%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.payment_transactions drop constraint %I', constraint_name);
  end if;

  alter table public.payment_transactions
    add constraint payment_transactions_payment_type_check
    check (payment_type in ('contribution', 'savings', 'piggy_bag', 'personal_susu', 'wallet_deposit'));
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
    and pg_get_constraintdef(oid) like '%transaction_type%'
  limit 1;

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
        'personal_susu_deposit',
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
  allowed_types text[] := array['contribution', 'savings', 'piggy_bag', 'personal_susu', 'wallet_deposit'];
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
      'mode', 'placeholder',
      'message', 'Hubtel payment is being prepared. Real payment will be enabled once API credentials are added.',
      'real_collection_enabled', false,
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
      'mode', 'placeholder'
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
    'successful',
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

create or replace function public.record_hubtel_payment_webhook(payload jsonb)
returns public.payment_webhook_events
language plpgsql
security definer
set search_path = public
as $$
declare
  reference text;
  incoming_status text;
  target_transaction public.payment_transactions;
  webhook_event public.payment_webhook_events;
  was_already_successful boolean := false;
begin
  reference := coalesce(payload->>'provider_reference', payload->>'ClientReference', payload->>'clientReference', payload->>'TransactionId', payload->>'transactionId');
  incoming_status := lower(coalesce(payload->>'status', payload->>'Status', payload->>'ResponseCode', 'received'));

  insert into public.payment_webhook_events (provider, provider_reference, event_type, payload, processing_status)
  values ('hubtel', reference, coalesce(payload->>'event', payload->>'EventType', 'payment_callback'), payload, 'received')
  returning * into webhook_event;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    null,
    'payment_webhook_received',
    'payment_webhook_event',
    webhook_event.id,
    'Hubtel payment webhook received.',
    jsonb_build_object('provider_reference', reference, 'status', incoming_status)
  );

  if reference is null then
    update public.payment_webhook_events
    set processing_status = 'failed',
        processing_error = 'Missing provider reference',
        processed_at = now()
    where id = webhook_event.id
    returning * into webhook_event;

    return webhook_event;
  end if;

  select *
  into target_transaction
  from public.payment_transactions
  where provider = 'hubtel'
    and provider_reference = reference
  order by created_at desc
  limit 1;

  if target_transaction.id is null then
    update public.payment_webhook_events
    set processing_status = 'failed',
        processing_error = 'No matching payment transaction',
        processed_at = now()
    where id = webhook_event.id
    returning * into webhook_event;

    return webhook_event;
  end if;

  was_already_successful := target_transaction.status = 'successful';

  if incoming_status in ('successful', 'success', 'paid', '0000') then
    update public.payment_transactions
    set status = 'successful',
        provider_response = coalesce(provider_response, '{}'::jsonb) || payload,
        updated_at = now()
    where id = target_transaction.id
    returning * into target_transaction;

    perform public.account_successful_payment(target_transaction);

    update public.contribution_payments
    set status = 'successful',
        updated_at = now()
    where payment_transaction_id = target_transaction.id;

    if target_transaction.contribution_id is not null then
      update public.contributions
      set status = 'paid',
          paid_at = coalesce(paid_at, now()),
          payment_reference = target_transaction.provider_reference,
          updated_at = now()
      where id = target_transaction.contribution_id;
    end if;

    if not was_already_successful then
      insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
      values (
        null,
        'payment_success',
        'payment_transaction',
        target_transaction.id,
        'Hubtel webhook confirmed payment successful.',
        jsonb_build_object(
          'provider_reference', reference,
          'payment_type', target_transaction.payment_type,
          'contribution_id', target_transaction.contribution_id
        )
      );
    end if;
  elsif incoming_status in ('failed', 'failure', 'cancelled', 'reversed') then
    update public.payment_transactions
    set status = case when incoming_status = 'reversed' then 'reversed' when incoming_status = 'cancelled' then 'cancelled' else 'failed' end,
        provider_response = coalesce(provider_response, '{}'::jsonb) || payload,
        updated_at = now()
    where id = target_transaction.id;

    update public.contribution_payments
    set status = case when incoming_status = 'reversed' then 'reversed' when incoming_status = 'cancelled' then 'cancelled' else 'failed' end,
        updated_at = now()
    where payment_transaction_id = target_transaction.id;

    update public.contributions
    set status = case when incoming_status = 'failed' or incoming_status = 'failure' then 'failed'::public.contribution_status else status end,
        updated_at = now()
    where id = target_transaction.contribution_id;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      null,
      'payment_failed',
      'payment_transaction',
      target_transaction.id,
      'Hubtel webhook marked payment failed.',
      jsonb_build_object('provider_reference', reference, 'payment_type', target_transaction.payment_type)
    );
  end if;

  update public.payment_webhook_events
  set processing_status = 'processed',
      processed_at = now()
  where id = webhook_event.id
  returning * into webhook_event;

  return webhook_event;
end;
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
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  wallet public.wallet_accounts;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  wallet := public.ensure_wallet_account(auth.uid(), 'GHS');

  return query
  with successful_payments as (
    select *
    from public.payment_transactions pt
    where pt.user_id = auth.uid()
      and pt.status = 'successful'
  ),
  successful_wallet as (
    select *
    from public.wallet_transactions wt
    where wt.user_id = auth.uid()
      and wt.status = 'successful'
  )
  select
    coalesce((select sum(amount) from successful_payments), 0),
    coalesce((select sum(amount) from successful_payments where payment_type in ('wallet_deposit', 'piggy_bag', 'savings', 'personal_susu')), 0),
    coalesce((select sum(coalesce(amount_due, amount, 0)) from public.contributions where user_id = auth.uid() and status::text in ('paid', 'processed')), 0),
    coalesce((select sum(amount) from successful_wallet where transaction_type = 'piggy_bag_deposit'), 0),
    coalesce((select sum(amount) from successful_wallet where transaction_type in ('savings_deposit', 'personal_susu_deposit')), 0),
    wallet.available_balance,
    wallet.locked_balance,
    coalesce((select sum(amount) from successful_wallet where transaction_type = 'payout_received'), 0),
    wallet.currency;
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
    pt.payment_type,
    case pt.payment_type
      when 'contribution' then 'Circle contribution'
      when 'piggy_bag' then 'Piggy Bag'
      when 'savings' then 'Savings plan'
      when 'personal_susu' then 'Personal Susu'
      when 'wallet_deposit' then 'Wallet deposit'
      else initcap(replace(pt.payment_type, '_', ' '))
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
  left join public.wallet_transactions wt on wt.payment_transaction_id = pt.id
  where pt.user_id = auth.uid()
  order by pt.created_at desc;
$$;

create or replace function public.get_piggy_financial_summary()
returns table (
  plan_id uuid,
  plan_name text,
  target_amount numeric,
  total_deposited numeric,
  locked_amount numeric,
  progress_percentage numeric,
  payment_count integer,
  last_payment_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    plan.id,
    plan.name,
    plan.target_amount,
    coalesce(sum(deposit.amount) filter (where deposit.payment_status = 'paid'), 0),
    case
      when plan.locked_until >= current_date then coalesce(sum(deposit.amount) filter (where deposit.payment_status = 'paid'), 0)
      else 0
    end,
    case
      when plan.target_amount > 0 then least(round((coalesce(sum(deposit.amount) filter (where deposit.payment_status = 'paid'), 0) / plan.target_amount) * 100, 2), 100)
      else 0
    end,
    count(deposit.id) filter (where deposit.payment_status = 'paid')::integer,
    max(deposit.deposited_at) filter (where deposit.payment_status = 'paid')
  from public.personal_susu_plans plan
  left join public.personal_susu_deposits deposit on deposit.plan_id = plan.id
  where plan.user_id = auth.uid()
  group by plan.id, plan.name, plan.target_amount, plan.locked_until
  order by plan.created_at desc;
$$;

create or replace function public.get_circle_payment_summary(check_circle_id uuid)
returns table (
  circle_id uuid,
  total_expected numeric,
  total_paid numeric,
  pending_amount numeric,
  overdue_amount numeric,
  failed_amount numeric,
  members_paid integer,
  members_pending integer,
  members_overdue integer,
  funding_progress numeric
)
language sql
security definer
set search_path = public
stable
as $$
  with visible_contributions as (
    select *
    from public.contributions c
    where c.circle_id = check_circle_id
      and (
        public.is_circle_admin(check_circle_id, auth.uid())
        or c.user_id = auth.uid()
        or public.is_approved_circle_member(check_circle_id, auth.uid())
      )
  ),
  normalized as (
    select
      user_id,
      coalesce(amount_due, amount, 0) as amount,
      case
        when status::text in ('paid', 'processed') then 'paid'
        when status::text in ('failed') then 'failed'
        when due_date is not null and due_date < now() and status::text in ('pending', 'unpaid', 'late') then 'overdue'
        when status::text = 'late' then 'overdue'
        else 'pending'
      end as normalized_status
    from visible_contributions
  )
  select
    check_circle_id,
    coalesce(sum(amount), 0),
    coalesce(sum(amount) filter (where normalized_status = 'paid'), 0),
    coalesce(sum(amount) filter (where normalized_status = 'pending'), 0),
    coalesce(sum(amount) filter (where normalized_status = 'overdue'), 0),
    coalesce(sum(amount) filter (where normalized_status = 'failed'), 0),
    count(distinct user_id) filter (where normalized_status = 'paid')::integer,
    count(distinct user_id) filter (where normalized_status = 'pending')::integer,
    count(distinct user_id) filter (where normalized_status = 'overdue')::integer,
    case
      when coalesce(sum(amount), 0) > 0 then round((coalesce(sum(amount) filter (where normalized_status = 'paid'), 0) / sum(amount)) * 100, 2)
      else 0
    end
  from normalized;
$$;

notify pgrst, 'reload schema';
