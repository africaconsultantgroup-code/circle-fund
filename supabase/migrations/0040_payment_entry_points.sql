-- 0040_payment_entry_points.sql
-- Adds typed placeholder payment initiation for all customer money surfaces.

alter table public.payment_transactions
  add column if not exists payment_type text not null default 'contribution';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_transactions_payment_type_check'
      and conrelid = 'public.payment_transactions'::regclass
  ) then
    alter table public.payment_transactions
      add constraint payment_transactions_payment_type_check
      check (payment_type in ('contribution', 'savings', 'piggy_bag', 'personal_susu'));
  end if;
end $$;

create index if not exists payment_transactions_payment_type_idx
  on public.payment_transactions (payment_type, created_at desc);

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
  allowed_types text[] := array['contribution', 'savings', 'piggy_bag', 'personal_susu'];
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

  reference := 'hubtel-prep-' || substr(gen_random_uuid()::text, 1, 12);

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
    'Customer initiated placeholder Hubtel payment.',
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

create or replace function public.initiate_hubtel_contribution_payment(check_contribution_id uuid)
returns public.payment_transactions
language sql
security definer
set search_path = public
as $$
  select public.initiate_placeholder_payment(
    'contribution',
    1,
    'GHS',
    null,
    check_contribution_id,
    jsonb_build_object('source', 'contribution_payment_button')
  );
$$;
