-- Working Group 2: provider-independent protected-funds foundation.
-- This does not implement external custody or payout execution.

create table if not exists public.protected_fund_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  fund_type text not null check (fund_type in ('circle', 'piggy')),
  circle_id uuid references public.circles(id) on delete restrict,
  piggy_id uuid references public.personal_susu_plans(id) on delete restrict,
  source_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  source_payment_transaction_id uuid references public.payment_transactions(id) on delete restrict,
  source_deposit_id uuid references public.personal_susu_deposits(id) on delete restrict,
  beneficiary_user_id uuid references auth.users(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'GHS',
  status text not null default 'protected'
    check (status in ('pending', 'protected', 'frozen', 'matured', 'release_pending', 'released', 'cancelled')),
  maturity_date date,
  protected_at timestamptz not null default now(),
  matured_at timestamptz,
  released_at timestamptz,
  frozen_at timestamptz,
  unfrozen_at timestamptz,
  freeze_reason text,
  release_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  custody_provider text,
  custody_account_reference text,
  custody_subaccount_reference text,
  external_fund_reference text,
  settlement_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint protected_fund_target_check check (
    (fund_type = 'circle' and circle_id is not null and piggy_id is null)
    or (fund_type = 'piggy' and piggy_id is not null and circle_id is null)
  ),
  constraint protected_fund_source_check check (
    num_nonnulls(source_transaction_id, source_payment_transaction_id, source_deposit_id) >= 1
  )
);

create unique index if not exists protected_fund_payment_source_key
  on public.protected_fund_ledger(source_payment_transaction_id)
  where source_payment_transaction_id is not null;
create unique index if not exists protected_fund_wallet_source_key
  on public.protected_fund_ledger(source_transaction_id)
  where source_transaction_id is not null;
create unique index if not exists protected_fund_deposit_source_key
  on public.protected_fund_ledger(source_deposit_id)
  where source_deposit_id is not null;
create index if not exists protected_fund_user_status_idx
  on public.protected_fund_ledger(user_id, status, fund_type);
create index if not exists protected_fund_circle_status_idx
  on public.protected_fund_ledger(circle_id, status) where circle_id is not null;
create index if not exists protected_fund_piggy_status_idx
  on public.protected_fund_ledger(piggy_id, status) where piggy_id is not null;

create table if not exists public.protected_fund_events (
  id uuid primary key default gen_random_uuid(),
  protected_fund_id uuid not null references public.protected_fund_ledger(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'protect', 'mature', 'freeze', 'unfreeze', 'release_started', 'release',
    'adjustment', 'duplicate_blocked', 'maturity_blocked_frozen', 'backfilled'
  )),
  amount numeric(12, 2),
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists protected_fund_events_fund_idx
  on public.protected_fund_events(protected_fund_id, created_at);

create table if not exists public.protection_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  issue_type text not null,
  source_payment_transaction_id uuid references public.payment_transactions(id) on delete restrict,
  source_transaction_id uuid references public.wallet_transactions(id) on delete restrict,
  protected_fund_id uuid references public.protected_fund_ledger(id) on delete restrict,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text
);

create unique index if not exists protection_reconciliation_payment_issue_key
  on public.protection_reconciliation_queue(issue_type, source_payment_transaction_id)
  where source_payment_transaction_id is not null and status in ('open', 'investigating');
create unique index if not exists protection_reconciliation_wallet_issue_key
  on public.protection_reconciliation_queue(issue_type, source_transaction_id)
  where source_transaction_id is not null and status in ('open', 'investigating');

alter table public.protected_fund_ledger enable row level security;
alter table public.protected_fund_events enable row level security;
alter table public.protection_reconciliation_queue enable row level security;

create policy "Protected funds: customers view permitted funds"
  on public.protected_fund_ledger for select
  using (
    user_id = auth.uid()
    or (fund_type = 'piggy' and beneficiary_user_id = auth.uid())
  );
create policy "Protected funds: staff view"
  on public.protected_fund_ledger for select
  using (public.current_user_staff_role() is not null);
create policy "Protected events: permitted viewers"
  on public.protected_fund_events for select
  using (
    exists (
      select 1 from public.protected_fund_ledger pf
      where pf.id = protected_fund_events.protected_fund_id
        and (
          pf.user_id = auth.uid()
          or (pf.fund_type = 'piggy' and pf.beneficiary_user_id = auth.uid())
          or public.current_user_staff_role() is not null
        )
    )
  );
create policy "Protection reconciliation: staff view"
  on public.protection_reconciliation_queue for select
  using (public.current_user_staff_role() is not null);

revoke insert, update, delete on public.protected_fund_ledger, public.protected_fund_events,
  public.protection_reconciliation_queue from anon, authenticated;
drop policy if exists "Personal susu deposits: phone verified users can insert own deposits"
  on public.personal_susu_deposits;
revoke insert, update, delete on public.personal_susu_deposits from anon, authenticated;

create or replace function public.prevent_protected_fund_immutable_changes()
returns trigger language plpgsql set search_path = public as $$
begin
  if row(
    new.user_id, new.fund_type, new.circle_id, new.piggy_id, new.source_transaction_id,
    new.source_payment_transaction_id, new.source_deposit_id, new.beneficiary_user_id,
    new.amount, new.currency, new.protected_at
  ) is distinct from row(
    old.user_id, old.fund_type, old.circle_id, old.piggy_id, old.source_transaction_id,
    old.source_payment_transaction_id, old.source_deposit_id, old.beneficiary_user_id,
    old.amount, old.currency, old.protected_at
  ) then
    raise exception 'Protected fund ownership, source, beneficiary, amount, and currency are immutable';
  end if;
  return new;
end;
$$;

create trigger protected_fund_immutable_fields
before update on public.protected_fund_ledger
for each row execute function public.prevent_protected_fund_immutable_changes();

create or replace function public.prevent_protected_event_mutation()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'Protected fund events are append-only';
end;
$$;

create trigger protected_fund_events_append_only
before update or delete on public.protected_fund_events
for each row execute function public.prevent_protected_event_mutation();

create or replace function public.resolve_circle_protection_terms(
  check_circle_id uuid,
  check_contribution_id uuid,
  out resolved_beneficiary uuid,
  out resolved_maturity date
)
language plpgsql security definer set search_path = public as $$
declare contribution_due date;
begin
  select due_date::date into contribution_due
  from public.contributions where id = check_contribution_id;

  select cm.user_id, ps.payout_due_date::date
  into resolved_beneficiary, resolved_maturity
  from public.payout_schedule ps
  join public.circle_members cm on cm.id = ps.member_id
  where ps.circle_id = check_circle_id
    and ps.payout_due_date::date = contribution_due
    and ps.locked_at is not null
  limit 1;
end;
$$;

create or replace function public.protect_successful_payment(check_payment_transaction_id uuid)
returns public.protected_fund_ledger
language plpgsql security definer set search_path = public as $$
declare
  payment public.payment_transactions;
  created_fund public.protected_fund_ledger;
  normalized_type text;
  plan_id uuid;
  maturity date;
  beneficiary uuid;
begin
  select * into payment from public.payment_transactions
  where id = check_payment_transaction_id for update;
  if payment.id is null then raise exception 'Payment transaction not found'; end if;
  if payment.status <> 'successful' then return null; end if;

  select * into created_fund from public.protected_fund_ledger
  where source_payment_transaction_id = payment.id;
  if created_fund.id is not null then
    insert into public.protected_fund_events(protected_fund_id, event_type, reason)
    values (created_fund.id, 'duplicate_blocked', 'Duplicate payment protection was blocked.');
    insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
    values (null, 'protection_duplicate_blocked', 'protected_fund', created_fund.id,
      'Duplicate payment protection was blocked.',
      jsonb_build_object('source_payment_transaction_id', payment.id));
    return created_fund;
  end if;

  normalized_type := lower(replace(coalesce(payment.payment_type::text, ''), ' ', '_'));
  if normalized_type in ('contribution', 'susu_contribution', 'circle_contribution') then
    if payment.circle_id is null or payment.contribution_id is null then
      insert into public.protection_reconciliation_queue(issue_type, source_payment_transaction_id, details)
      values ('ambiguous_circle_payment', payment.id, jsonb_build_object('circle_id', payment.circle_id, 'contribution_id', payment.contribution_id))
      on conflict do nothing;
      return null;
    end if;
    select resolved_beneficiary, resolved_maturity into beneficiary, maturity
    from public.resolve_circle_protection_terms(payment.circle_id, payment.contribution_id);

    if beneficiary is null or maturity is null then
      insert into public.protection_reconciliation_queue(
        issue_type, source_payment_transaction_id, details
      )
      values (
        case
          when not exists (
            select 1
            from public.contributions c
            join public.payout_schedule ps
              on ps.circle_id = c.circle_id
             and ps.payout_due_date::date = c.due_date::date
             and ps.locked_at is not null
            where c.id = payment.contribution_id
              and c.circle_id = payment.circle_id
          ) then 'missing_payout_schedule'
          when beneficiary is null then 'missing_beneficiary'
          when maturity is null then 'missing_maturity_date'
          else 'ambiguous_circle_protection'
        end,
        payment.id,
        jsonb_build_object(
          'circle_id', payment.circle_id,
          'contribution_id', payment.contribution_id,
          'beneficiary_user_id', beneficiary,
          'maturity_date', maturity
        )
      )
      on conflict do nothing;
      return null;
    end if;

    insert into public.protected_fund_ledger(
      user_id, fund_type, circle_id, source_payment_transaction_id, beneficiary_user_id,
      amount, currency, status, maturity_date, protected_at, metadata
    ) values (
      payment.user_id, 'circle', payment.circle_id, payment.id, beneficiary,
      payment.amount, payment.currency, 'protected', maturity, payment.updated_at,
      jsonb_build_object('contribution_id', payment.contribution_id, 'provider', payment.provider, 'provider_reference', payment.provider_reference)
    ) returning * into created_fund;
  elsif normalized_type in ('piggy_bag', 'piggy', 'piggy_box', 'piggybag') then
    begin
      plan_id := nullif(coalesce(payment.provider_response->>'planId', payment.provider_response->>'plan_id'), '')::uuid;
    exception when invalid_text_representation then
      plan_id := null;
    end;
    if plan_id is null or not exists (
      select 1 from public.personal_susu_plans p where p.id = plan_id and p.user_id = payment.user_id
    ) then
      insert into public.protection_reconciliation_queue(issue_type, source_payment_transaction_id, details)
      values ('ambiguous_piggy_payment', payment.id, jsonb_build_object('plan_id', plan_id))
      on conflict do nothing;
      return null;
    end if;
    select coalesce(locked_until, end_date) into maturity
    from public.personal_susu_plans where id = plan_id;
    if maturity is null then
      insert into public.protection_reconciliation_queue(
        issue_type, source_payment_transaction_id, details
      )
      values (
        'missing_maturity_date',
        payment.id,
        jsonb_build_object('plan_id', plan_id, 'fund_type', 'piggy')
      )
      on conflict do nothing;
      return null;
    end if;
    insert into public.protected_fund_ledger(
      user_id, fund_type, piggy_id, source_payment_transaction_id, beneficiary_user_id,
      amount, currency, status, maturity_date, protected_at, metadata
    ) values (
      payment.user_id, 'piggy', plan_id, payment.id, payment.user_id,
      payment.amount, payment.currency, 'protected', maturity, payment.updated_at,
      jsonb_build_object('provider', payment.provider, 'provider_reference', payment.provider_reference)
    ) returning * into created_fund;
  else
    return null;
  end if;

  insert into public.protected_fund_events(protected_fund_id, event_type, amount, metadata)
  values (created_fund.id, 'protect', created_fund.amount, jsonb_build_object('source_payment_transaction_id', payment.id));
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (null, 'fund_protected', 'protected_fund', created_fund.id, 'Successful payment allocated to protected funds.',
    jsonb_build_object('amount', created_fund.amount, 'fund_type', created_fund.fund_type, 'source_payment_transaction_id', payment.id));
  return created_fund;
exception when unique_violation then
  select * into created_fund from public.protected_fund_ledger where source_payment_transaction_id = payment.id;
  return created_fund;
end;
$$;

create or replace function public.protect_confirmed_wallet_transaction(check_wallet_transaction_id uuid)
returns public.protected_fund_ledger
language plpgsql security definer set search_path = public as $$
declare
  transaction_row public.wallet_transactions;
  created_fund public.protected_fund_ledger;
  normalized_type text;
  plan_id uuid;
  maturity date;
  beneficiary uuid;
begin
  select * into transaction_row from public.wallet_transactions
  where id = check_wallet_transaction_id for update;
  if transaction_row.id is null or transaction_row.status not in ('confirmed', 'successful') then return null; end if;
  if transaction_row.payment_transaction_id is not null then return null; end if;
  select * into created_fund from public.protected_fund_ledger
  where source_transaction_id = transaction_row.id;
  if created_fund.id is not null then
    insert into public.protected_fund_events(protected_fund_id, event_type, reason)
    values (created_fund.id, 'duplicate_blocked', 'Duplicate wallet protection was blocked.');
    return created_fund;
  end if;

  normalized_type := coalesce(transaction_row.metadata->>'payment_type',
    case when transaction_row.transaction_type = 'contribution_payment' then 'contribution'
         when transaction_row.transaction_type = 'piggy_bag_deposit' then 'piggy_bag' else '' end);
  begin
    plan_id := nullif(transaction_row.metadata->>'plan_id', '')::uuid;
  exception when invalid_text_representation then
    plan_id := null;
  end;

  if normalized_type = 'contribution' and transaction_row.circle_id is not null and transaction_row.contribution_id is not null then
    select resolved_beneficiary, resolved_maturity into beneficiary, maturity
    from public.resolve_circle_protection_terms(transaction_row.circle_id, transaction_row.contribution_id);
    if beneficiary is null or maturity is null then
      insert into public.protection_reconciliation_queue(
        issue_type, source_transaction_id, details
      )
      values (
        case
          when not exists (
            select 1
            from public.contributions c
            join public.payout_schedule ps
              on ps.circle_id = c.circle_id
             and ps.payout_due_date::date = c.due_date::date
             and ps.locked_at is not null
            where c.id = transaction_row.contribution_id
              and c.circle_id = transaction_row.circle_id
          ) then 'missing_payout_schedule'
          when beneficiary is null then 'missing_beneficiary'
          when maturity is null then 'missing_maturity_date'
          else 'ambiguous_circle_protection'
        end,
        transaction_row.id,
        jsonb_build_object(
          'circle_id', transaction_row.circle_id,
          'contribution_id', transaction_row.contribution_id,
          'beneficiary_user_id', beneficiary,
          'maturity_date', maturity
        )
      )
      on conflict do nothing;
      return null;
    end if;
    insert into public.protected_fund_ledger(
      user_id, fund_type, circle_id, source_transaction_id, beneficiary_user_id,
      amount, currency, maturity_date, protected_at, metadata
    ) values (
      transaction_row.user_id, 'circle', transaction_row.circle_id, transaction_row.id, beneficiary,
      transaction_row.amount, transaction_row.currency, maturity, transaction_row.created_at,
      jsonb_build_object('contribution_id', transaction_row.contribution_id, 'source', 'available_wallet')
    ) returning * into created_fund;
  elsif normalized_type = 'piggy_bag' and plan_id is not null and exists (
    select 1 from public.personal_susu_plans p where p.id = plan_id and p.user_id = transaction_row.user_id
  ) then
    select coalesce(locked_until, end_date) into maturity
    from public.personal_susu_plans where id = plan_id;
    if maturity is null then
      insert into public.protection_reconciliation_queue(
        issue_type, source_transaction_id, details
      )
      values (
        'missing_maturity_date',
        transaction_row.id,
        jsonb_build_object('plan_id', plan_id, 'fund_type', 'piggy')
      )
      on conflict do nothing;
      return null;
    end if;
    insert into public.protected_fund_ledger(
      user_id, fund_type, piggy_id, source_transaction_id, beneficiary_user_id,
      amount, currency, maturity_date, protected_at, metadata
    ) values (
      transaction_row.user_id, 'piggy', plan_id, transaction_row.id, transaction_row.user_id,
      transaction_row.amount, transaction_row.currency, maturity, transaction_row.created_at,
      jsonb_build_object('source', 'available_wallet')
    ) returning * into created_fund;
  else
    if normalized_type in ('contribution', 'piggy_bag') then
      insert into public.protection_reconciliation_queue(issue_type, source_transaction_id, details)
      values ('ambiguous_wallet_protection', transaction_row.id, transaction_row.metadata)
      on conflict do nothing;
    end if;
    return null;
  end if;

  insert into public.protected_fund_events(protected_fund_id, event_type, amount, metadata)
  values (created_fund.id, 'protect', created_fund.amount, jsonb_build_object('source_transaction_id', transaction_row.id));
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (null, 'fund_protected', 'protected_fund', created_fund.id, 'Available wallet payment allocated to protected funds.',
    jsonb_build_object('amount', created_fund.amount, 'fund_type', created_fund.fund_type, 'source_transaction_id', transaction_row.id));
  return created_fund;
exception when unique_violation then
  select * into created_fund from public.protected_fund_ledger where source_transaction_id = transaction_row.id;
  return created_fund;
end;
$$;

create or replace function public.protect_payment_transaction_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'successful' and (tg_op = 'INSERT' or old.status is distinct from 'successful') then
    perform public.protect_successful_payment(new.id);
  end if;
  return new;
end;
$$;
create trigger protect_successful_payment_transaction
after insert or update of status on public.payment_transactions
for each row execute function public.protect_payment_transaction_trigger();

create or replace function public.protect_wallet_transaction_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('confirmed', 'successful') and new.transaction_type in ('contribution_payment', 'piggy_bag_deposit') then
    perform public.protect_confirmed_wallet_transaction(new.id);
  end if;
  return new;
end;
$$;
create trigger protect_confirmed_wallet_transaction
after insert on public.wallet_transactions
for each row execute function public.protect_wallet_transaction_trigger();

create or replace function public.advance_protected_fund_maturity(as_of_date date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare affected integer := 0; fund public.protected_fund_ledger;
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required'; end if;
  insert into public.protected_fund_events(protected_fund_id, event_type, reason)
  select id, 'maturity_blocked_frozen', 'Maturity date reached while fund was frozen.'
  from public.protected_fund_ledger
  where status = 'frozen' and maturity_date <= as_of_date
    and not exists (
      select 1 from public.protected_fund_events e
      where e.protected_fund_id = protected_fund_ledger.id
        and e.event_type = 'maturity_blocked_frozen'
        and e.created_at::date = as_of_date
    );

  for fund in
    select * from public.protected_fund_ledger
    where status = 'protected' and maturity_date <= as_of_date
      and (fund_type = 'piggy' or beneficiary_user_id is not null)
    for update skip locked
  loop
    update public.protected_fund_ledger
    set status = 'matured', matured_at = now(), updated_at = now()
    where id = fund.id;
    insert into public.protected_fund_events(protected_fund_id, event_type, amount)
    values (fund.id, 'mature', fund.amount);
    insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
    values (null, 'fund_matured', 'protected_fund', fund.id, 'Protected fund reached release eligibility.',
      jsonb_build_object('amount', fund.amount, 'fund_type', fund.fund_type, 'maturity_date', fund.maturity_date));
    affected := affected + 1;
  end loop;
  return affected;
end;
$$;

create or replace function public.set_protected_fund_freeze(
  check_fund_id uuid, requested_action text, reason text
)
returns public.protected_fund_ledger
language plpgsql security definer set search_path = public as $$
declare fund public.protected_fund_ledger; staff_role text;
begin
  staff_role := public.current_user_staff_role();
  if staff_role is null or staff_role::text not in ('super_admin', 'operations', 'compliance') then
    raise exception 'Operations or compliance access required';
  end if;
  if nullif(trim(reason), '') is null then raise exception 'A reason is required'; end if;
  select * into fund from public.protected_fund_ledger where id = check_fund_id for update;
  if fund.id is null then raise exception 'Protected fund not found'; end if;

  if requested_action = 'freeze' and fund.status in ('protected', 'matured') then
    update public.protected_fund_ledger set status = 'frozen', frozen_at = now(),
      freeze_reason = trim(reason), updated_at = now() where id = fund.id returning * into fund;
    insert into public.protected_fund_events(protected_fund_id, actor_user_id, event_type, reason)
    values (fund.id, auth.uid(), 'freeze', trim(reason));
    insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
    values (auth.uid(), 'fund_frozen', 'protected_fund', fund.id, trim(reason), jsonb_build_object('amount', fund.amount));
  elsif requested_action = 'unfreeze' and fund.status = 'frozen' then
    update public.protected_fund_ledger set
      status = case when maturity_date <= current_date and (fund_type = 'piggy' or beneficiary_user_id is not null) then 'matured' else 'protected' end,
      matured_at = case when maturity_date <= current_date then coalesce(matured_at, now()) else matured_at end,
      unfrozen_at = now(), freeze_reason = null, updated_at = now()
    where id = fund.id returning * into fund;
    insert into public.protected_fund_events(protected_fund_id, actor_user_id, event_type, reason)
    values (fund.id, auth.uid(), 'unfreeze', trim(reason));
    insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
    values (auth.uid(), 'fund_unfrozen', 'protected_fund', fund.id, trim(reason), jsonb_build_object('amount', fund.amount));
  else
    raise exception 'Freeze action is invalid for the current status';
  end if;
  return fund;
end;
$$;

create or replace function public.get_customer_protected_fund_summary()
returns table(
  available_wallet_balance numeric, protected_circle_funds numeric,
  protected_piggy_funds numeric, pending_balance numeric,
  matured_eligible_balance numeric, frozen_balance numeric, currency text
)
language sql security definer stable set search_path = public as $$
  select
    coalesce((select available_balance from public.wallet_accounts where user_id = auth.uid()), 0),
    coalesce(sum(amount) filter (where fund_type = 'circle' and status in ('protected', 'frozen', 'matured', 'release_pending')), 0),
    coalesce(sum(amount) filter (where fund_type = 'piggy' and status in ('protected', 'frozen', 'matured', 'release_pending')), 0),
    coalesce((select sum(amount) from public.payment_transactions where user_id = auth.uid() and status in ('initiated', 'pending')), 0),
    coalesce(sum(amount) filter (where status = 'matured'), 0),
    coalesce(sum(amount) filter (where status = 'frozen'), 0),
    coalesce(max(currency), 'GHS')
  from public.protected_fund_ledger where user_id = auth.uid();
$$;

create or replace function public.get_circle_protected_fund_summary(check_circle_id uuid)
returns table(
  total_protected numeric, pending numeric, frozen numeric, matured numeric,
  released numeric, remaining_protected numeric, my_protected numeric
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not exists (
    select 1 from public.circle_members
    where circle_id = check_circle_id and user_id = auth.uid() and status = 'approved'
  ) and public.current_user_staff_role() is null then
    raise exception 'Approved Circle membership required';
  end if;
  return query
  select
    coalesce(sum(amount) filter (where status in ('protected', 'frozen', 'matured', 'release_pending', 'released')), 0),
    coalesce(sum(amount) filter (where status = 'pending'), 0),
    coalesce(sum(amount) filter (where status = 'frozen'), 0),
    coalesce(sum(amount) filter (where status = 'matured'), 0),
    coalesce(sum(amount) filter (where status = 'released'), 0),
    coalesce(sum(amount) filter (where status in ('protected', 'frozen', 'matured', 'release_pending')), 0),
    coalesce(sum(amount) filter (
      where user_id = auth.uid() and status in ('protected', 'frozen', 'matured', 'release_pending')
    ), 0)
  from public.protected_fund_ledger where circle_id = check_circle_id;
end;
$$;

create or replace function public.protect_active_piggy_terms()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.protected_fund_ledger pf where pf.piggy_id = old.id
  ) or exists (
    select 1 from public.personal_susu_deposits d
    where d.plan_id = old.id and d.payment_status = 'paid'
  ) then
    if row(new.target_amount, new.start_date, new.end_date, new.locked_until, new.user_id)
      is distinct from row(old.target_amount, old.start_date, old.end_date, old.locked_until, old.user_id) then
      raise exception 'Financially active Piggy amount, ownership, and maturity terms are locked';
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_financially_active_piggy_terms
before update on public.personal_susu_plans
for each row execute function public.protect_active_piggy_terms();

create or replace function public.get_protection_reconciliation_report()
returns table(issue_type text, record_count bigint, total_amount numeric)
language sql security definer stable set search_path = public as $$
  with issues as (
    select 'successful_payment_without_protection'::text issue_type, pt.amount
    from public.payment_transactions pt
    where pt.status = 'successful'
      and lower(replace(coalesce(pt.payment_type::text, ''), ' ', '_')) in ('contribution', 'piggy_bag')
      and not exists (select 1 from public.protected_fund_ledger pf where pf.source_payment_transaction_id = pt.id)
    union all
    select 'protection_without_successful_payment', pf.amount
    from public.protected_fund_ledger pf
    join public.payment_transactions pt on pt.id = pf.source_payment_transaction_id
    where pt.status <> 'successful'
    union all
    select 'negative_derived_protected_balance', sum(case when status = 'released' then -amount else amount end)
    from public.protected_fund_ledger
    having sum(case when status = 'released' then -amount else amount end) < 0
    union all
    select 'matured_pending_over_7_days', amount
    from public.protected_fund_ledger
    where status = 'matured' and matured_at < now() - interval '7 days'
    union all
    select 'circle_contribution_total_mismatch', abs(contribution_total - protected_total)
    from (
      select c.circle_id,
        coalesce(sum(coalesce(c.amount_due, c.amount, 0)) filter (where c.status::text in ('paid', 'processed')), 0) contribution_total,
        coalesce((select sum(pf.amount) from public.protected_fund_ledger pf where pf.circle_id = c.circle_id), 0) protected_total
      from public.contributions c group by c.circle_id
    ) circle_totals where contribution_total <> protected_total
    union all
    select 'piggy_total_mismatch', abs(deposit_total - protected_total)
    from (
      select d.plan_id,
        coalesce(sum(d.amount) filter (where d.payment_status = 'paid'), 0) deposit_total,
        coalesce((select sum(pf.amount) from public.protected_fund_ledger pf where pf.piggy_id = d.plan_id), 0) protected_total
      from public.personal_susu_deposits d group by d.plan_id
    ) piggy_totals where deposit_total <> protected_total
  )
  select issues.issue_type, count(*), coalesce(sum(issues.amount), 0)
  from issues
  where public.current_user_staff_role() is not null
  group by issues.issue_type;
$$;

create or replace function public.protect_locked_payout_schedule_terms()
returns trigger language plpgsql set search_path = public as $$
declare financially_active boolean;
begin
  select exists (
    select 1 from public.contributions c
    where c.circle_id = old.circle_id and c.status::text in ('paid', 'processed')
  ) or exists (
    select 1 from public.protected_fund_ledger pf where pf.circle_id = old.circle_id
  ) into financially_active;

  if tg_op = 'DELETE' and (old.locked_at is not null or financially_active) then
    raise exception 'Financially active payout schedules cannot be deleted';
  end if;
  if tg_op = 'UPDATE' and (old.locked_at is not null or financially_active)
    and row(new.member_id, new.rotation_position, new.payout_due_date, new.payout_amount)
      is distinct from row(old.member_id, old.rotation_position, old.payout_due_date, old.payout_amount) then
    raise exception 'Beneficiary, payout position, date, and amount are locked after financial activity';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger protect_financially_active_payout_terms
before update or delete on public.payout_schedule
for each row execute function public.protect_locked_payout_schedule_terms();

-- Idempotent historical backfill. Ambiguous records are queued rather than guessed.
do $$
declare record_id uuid;
begin
  for record_id in
    select id from public.payment_transactions
    where status = 'successful'
      and lower(replace(coalesce(payment_type::text, ''), ' ', '_')) in ('contribution', 'piggy_bag')
    order by created_at
  loop
    perform public.protect_successful_payment(record_id);
  end loop;
  for record_id in
    select id from public.wallet_transactions
    where status in ('confirmed', 'successful')
      and payment_transaction_id is null
      and transaction_type in ('contribution_payment', 'piggy_bag_deposit')
    order by created_at
  loop
    perform public.protect_confirmed_wallet_transaction(record_id);
  end loop;
  insert into public.protected_fund_events(protected_fund_id, event_type, amount, reason)
  select pf.id, 'backfilled', pf.amount, 'Historical successful payment protection backfill.'
  from public.protected_fund_ledger pf
  where not exists (
    select 1 from public.protected_fund_events e
    where e.protected_fund_id = pf.id and e.event_type = 'backfilled'
  );
end;
$$;

revoke all on function public.prevent_protected_fund_immutable_changes() from public, anon, authenticated;
revoke all on function public.prevent_protected_event_mutation() from public, anon, authenticated;
revoke all on function public.resolve_circle_protection_terms(uuid, uuid) from public, anon, authenticated;
revoke all on function public.protect_successful_payment(uuid) from public, anon, authenticated;
revoke all on function public.protect_confirmed_wallet_transaction(uuid) from public, anon, authenticated;
revoke all on function public.protect_payment_transaction_trigger() from public, anon, authenticated;
revoke all on function public.protect_wallet_transaction_trigger() from public, anon, authenticated;
revoke all on function public.advance_protected_fund_maturity(date) from public, anon, authenticated;
revoke all on function public.set_protected_fund_freeze(uuid, text, text) from public, anon;
revoke all on function public.get_customer_protected_fund_summary() from public, anon;
revoke all on function public.get_circle_protected_fund_summary(uuid) from public, anon;
revoke all on function public.protect_active_piggy_terms() from public, anon, authenticated;
revoke all on function public.get_protection_reconciliation_report() from public, anon;
revoke all on function public.protect_locked_payout_schedule_terms() from public, anon, authenticated;
grant execute on function public.advance_protected_fund_maturity(date) to service_role;
grant execute on function public.set_protected_fund_freeze(uuid, text, text) to authenticated;
grant execute on function public.get_customer_protected_fund_summary() to authenticated;
grant execute on function public.get_circle_protected_fund_summary(uuid) to authenticated;
grant execute on function public.get_protection_reconciliation_report() to authenticated;

notify pgrst, 'reload schema';
