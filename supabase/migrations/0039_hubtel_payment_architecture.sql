-- 0039_hubtel_payment_architecture.sql
-- Prepares Hubtel payment tracking without activating real collections.

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  contribution_id uuid references public.contributions(id) on delete set null,
  amount numeric not null,
  currency text not null default 'GHS',
  payment_method text,
  provider text not null default 'hubtel',
  provider_reference text,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'successful', 'failed', 'cancelled', 'reversed')),
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contribution_payments (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions(id) on delete cascade,
  payment_transaction_id uuid not null references public.payment_transactions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete set null,
  amount numeric not null,
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'successful', 'failed', 'cancelled', 'reversed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contribution_id, payment_transaction_id)
);

create table if not exists public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'hubtel',
  provider_reference text,
  event_type text,
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'received' check (processing_status in ('received', 'processed', 'failed')),
  processing_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.payment_transactions enable row level security;
alter table public.contribution_payments enable row level security;
alter table public.payment_webhook_events enable row level security;

create index if not exists payment_transactions_user_id_idx on public.payment_transactions (user_id, created_at desc);
create index if not exists payment_transactions_contribution_id_idx on public.payment_transactions (contribution_id, created_at desc);
create index if not exists payment_transactions_provider_reference_idx on public.payment_transactions (provider_reference);
create index if not exists contribution_payments_contribution_id_idx on public.contribution_payments (contribution_id);
create index if not exists payment_webhook_events_provider_reference_idx on public.payment_webhook_events (provider_reference);

drop policy if exists "Payment transactions: users can select own rows" on public.payment_transactions;
create policy "Payment transactions: users can select own rows"
  on public.payment_transactions
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Payment transactions: circle admins can select circle rows" on public.payment_transactions;
create policy "Payment transactions: circle admins can select circle rows"
  on public.payment_transactions
  as permissive
  for select
  using (circle_id is not null and public.is_circle_admin(circle_id, auth.uid()));

drop policy if exists "Contribution payments: users can select own rows" on public.contribution_payments;
create policy "Contribution payments: users can select own rows"
  on public.contribution_payments
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Contribution payments: circle admins can select circle rows" on public.contribution_payments;
create policy "Contribution payments: circle admins can select circle rows"
  on public.contribution_payments
  as permissive
  for select
  using (circle_id is not null and public.is_circle_admin(circle_id, auth.uid()));

create or replace function public.initiate_hubtel_contribution_payment(check_contribution_id uuid)
returns public.payment_transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_contribution public.contributions;
  target_circle public.circles;
  created_transaction public.payment_transactions;
  reference text;
begin
  select *
  into target_contribution
  from public.contributions
  where id = check_contribution_id;

  if target_contribution.id is null then
    raise exception 'Contribution not found';
  end if;

  if target_contribution.user_id <> auth.uid() then
    raise exception 'You can only initiate payment for your own contribution';
  end if;

  if target_contribution.status::text in ('paid', 'processed') then
    raise exception 'This contribution is already paid';
  end if;

  select *
  into target_circle
  from public.circles
  where id = target_contribution.circle_id;

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
    provider_response,
    created_at,
    updated_at
  )
  values (
    target_contribution.user_id,
    target_contribution.circle_id,
    target_contribution.id,
    coalesce(target_contribution.amount_due, target_contribution.amount),
    coalesce(target_circle.base_currency::text, 'GHS'),
    'mobile_money',
    'hubtel',
    reference,
    'initiated',
    jsonb_build_object(
      'mode', 'placeholder',
      'message', 'Hubtel payment integration is being prepared.',
      'hubtel_env', coalesce(current_setting('app.hubtel_env', true), 'sandbox'),
      'real_collection_enabled', false,
      'money_movement_allowed', public.user_can_access_money_movement(target_contribution.user_id)
    ),
    now(),
    now()
  )
  returning * into created_transaction;

  insert into public.contribution_payments (
    contribution_id,
    payment_transaction_id,
    user_id,
    circle_id,
    amount,
    status
  )
  values (
    target_contribution.id,
    created_transaction.id,
    target_contribution.user_id,
    target_contribution.circle_id,
    created_transaction.amount,
    created_transaction.status
  );

  update public.contributions
  set payment_reference = created_transaction.provider_reference,
      updated_at = now()
  where id = target_contribution.id;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'payment_initiated',
    'payment_transaction',
    created_transaction.id,
    'Customer initiated placeholder Hubtel contribution payment.',
    jsonb_build_object(
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

drop function if exists public.get_circle_contribution_status(uuid);

create function public.get_circle_contribution_status(check_circle_id uuid)
returns table (
  contribution_id uuid,
  member_id uuid,
  user_id uuid,
  full_name text,
  expected_amount numeric,
  due_date timestamptz,
  status text,
  paid_at timestamptz,
  payment_reference text,
  payment_transaction_id uuid,
  payment_status text,
  payment_provider text,
  payment_created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with latest_payment as (
    select distinct on (pt.contribution_id)
      pt.contribution_id,
      pt.id,
      pt.status,
      pt.provider,
      pt.provider_reference,
      pt.created_at
    from public.payment_transactions pt
    where pt.contribution_id is not null
    order by pt.contribution_id, pt.created_at desc
  )
  select
    c.id,
    c.member_id,
    c.user_id,
    p.full_name,
    coalesce(c.amount_due, c.amount),
    c.due_date,
    case
      when c.status::text in ('paid', 'processed') then 'paid'
      when c.status::text = 'failed' then 'failed'
      when c.due_date is not null
        and c.due_date < now()
        and c.status::text in ('pending', 'unpaid') then 'overdue'
      when c.status::text in ('pending', 'unpaid') then 'unpaid'
      when c.status::text = 'late' then 'overdue'
      else c.status::text
    end as status,
    c.paid_at,
    coalesce(lp.provider_reference, c.payment_reference, c.reference),
    lp.id,
    lp.status,
    lp.provider,
    lp.created_at
  from public.contributions c
  left join public.profiles p on p.user_id = c.user_id
  left join latest_payment lp on lp.contribution_id = c.id
  where c.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or c.user_id = auth.uid()
    )
  order by coalesce(c.due_date, c.contribution_date) asc;
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
    'Hubtel payment webhook placeholder received.',
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

  if incoming_status in ('successful', 'success', 'paid', '0000') then
    update public.payment_transactions
    set status = 'successful',
        provider_response = payload,
        updated_at = now()
    where id = target_transaction.id;

    update public.contribution_payments
    set status = 'successful',
        updated_at = now()
    where payment_transaction_id = target_transaction.id;

    update public.contributions
    set status = 'paid',
        paid_at = now(),
        payment_reference = target_transaction.provider_reference,
        updated_at = now()
    where id = target_transaction.contribution_id;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      null,
      'payment_success',
      'payment_transaction',
      target_transaction.id,
      'Hubtel webhook marked placeholder payment successful.',
      jsonb_build_object('provider_reference', reference, 'contribution_id', target_transaction.contribution_id)
    );
  elsif incoming_status in ('failed', 'failure', 'cancelled', 'reversed') then
    update public.payment_transactions
    set status = case when incoming_status = 'reversed' then 'reversed' when incoming_status = 'cancelled' then 'cancelled' else 'failed' end,
        provider_response = payload,
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
      'Hubtel webhook marked placeholder payment failed.',
      jsonb_build_object('provider_reference', reference, 'contribution_id', target_transaction.contribution_id)
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
