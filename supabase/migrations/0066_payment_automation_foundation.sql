-- Provider-independent payment automation foundation.
-- This migration does not enable or simulate recurring Hubtel deductions.

create table if not exists public.payment_automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_type text not null check (automation_type in ('circle_autopay', 'piggy_autosave')),
  circle_id uuid references public.circles(id) on delete restrict,
  piggy_id uuid references public.personal_susu_plans(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  frequency text not null check (frequency in ('daily', 'weekly', 'biweekly', 'monthly')),
  payment_method text not null check (payment_method in ('mobile_money', 'wallet')),
  phone_number text,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled', 'completed')),
  authorization_status text not null default 'pending'
    check (authorization_status in ('pending', 'authorized', 'declined', 'revoked', 'not_required')),
  authorization_reference text,
  next_collection_date date not null,
  last_collection_date date,
  last_successful_collection_date date,
  last_failed_collection_date date,
  retry_count integer not null default 0 check (retry_count >= 0),
  max_retries integer not null default 2 check (max_retries between 0 and 10),
  failure_reason text,
  paused_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_automations_target_check check (
    (automation_type = 'circle_autopay' and circle_id is not null and piggy_id is null)
    or
    (automation_type = 'piggy_autosave' and piggy_id is not null and circle_id is null)
  ),
  constraint payment_automations_phone_check check (
    payment_method <> 'mobile_money' or phone_number is not null
  )
);

create unique index if not exists payment_automations_active_circle_idx
  on public.payment_automations(user_id, circle_id)
  where automation_type = 'circle_autopay' and status in ('active', 'paused');

create unique index if not exists payment_automations_active_piggy_idx
  on public.payment_automations(user_id, piggy_id)
  where automation_type = 'piggy_autosave' and status in ('active', 'paused');

create index if not exists payment_automations_user_status_idx
  on public.payment_automations(user_id, status, next_collection_date);

create table if not exists public.scheduled_payments (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.payment_automations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete restrict,
  piggy_id uuid references public.personal_susu_plans(id) on delete restrict,
  contribution_id uuid references public.contributions(id) on delete set null,
  payment_type text not null check (payment_type in ('circle_contribution', 'piggy_autosave')),
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'due', 'processing', 'successful', 'failed', 'retry_scheduled', 'overdue', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  payment_transaction_id uuid references public.payment_transactions(id) on delete set null,
  provider_reference text,
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  failure_reason text,
  reminder_24h_sent_at timestamptz,
  due_reminder_sent_at timestamptz,
  final_failure_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (automation_id, due_date),
  constraint scheduled_payments_target_check check (
    (payment_type = 'circle_contribution' and circle_id is not null and piggy_id is null)
    or
    (payment_type = 'piggy_autosave' and piggy_id is not null and circle_id is null)
  )
);

create index if not exists scheduled_payments_user_due_idx
  on public.scheduled_payments(user_id, due_date, status);
create index if not exists scheduled_payments_processing_idx
  on public.scheduled_payments(status, next_retry_at, due_date);

alter table public.notifications
  add column if not exists automation_id uuid references public.payment_automations(id) on delete cascade,
  add column if not exists scheduled_payment_id uuid references public.scheduled_payments(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'join_request',
    'membership_approved',
    'membership_rejected',
    'payment_due_tomorrow',
    'payment_due_today',
    'payment_successful',
    'payment_failed',
    'payment_retry_scheduled',
    'payment_overdue'
  ));

create unique index if not exists notifications_scheduled_payment_type_user_idx
  on public.notifications(scheduled_payment_id, type, user_id)
  where scheduled_payment_id is not null;

alter table public.payment_automations enable row level security;
alter table public.scheduled_payments enable row level security;

drop policy if exists "Payment automations: users can select own" on public.payment_automations;
create policy "Payment automations: users can select own"
  on public.payment_automations for select
  using (user_id = auth.uid());

drop policy if exists "Payment automations: staff can select all" on public.payment_automations;
create policy "Payment automations: staff can select all"
  on public.payment_automations for select
  using (public.current_user_staff_role() is not null);

drop policy if exists "Scheduled payments: users can select own" on public.scheduled_payments;
create policy "Scheduled payments: users can select own"
  on public.scheduled_payments for select
  using (user_id = auth.uid());

drop policy if exists "Scheduled payments: staff can select all" on public.scheduled_payments;
create policy "Scheduled payments: staff can select all"
  on public.scheduled_payments for select
  using (public.current_user_staff_role() is not null);

create or replace function public.automation_next_date(base_date date, frequency text)
returns date
language sql
immutable
set search_path = public
as $$
  select case frequency
    when 'daily' then base_date + 1
    when 'weekly' then base_date + 7
    when 'biweekly' then base_date + 14
    when 'monthly' then (base_date + interval '1 month')::date
    else null
  end;
$$;

create or replace function public.record_automation_audit(
  actor_id uuid,
  event_action text,
  automation_id uuid,
  details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (actor_id, event_action, 'payment_automation', automation_id, 'Payment automation lifecycle event.', details);
end;
$$;

create or replace function public.enable_payment_automation(
  requested_type text,
  requested_circle_id uuid default null,
  requested_piggy_id uuid default null,
  requested_amount numeric default null,
  requested_frequency text default null,
  requested_payment_method text default 'mobile_money',
  requested_phone_number text default null,
  requested_start_date date default current_date,
  requested_max_retries integer default 2
)
returns public.payment_automations
language plpgsql
security definer
set search_path = public
as $$
declare
  created_automation public.payment_automations;
  target_circle public.circles;
  target_plan public.personal_susu_plans;
  resolved_amount numeric;
  resolved_frequency text;
  resolved_start date := greatest(coalesce(requested_start_date, current_date), current_date);
  event_action text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if requested_type not in ('circle_autopay', 'piggy_autosave') then raise exception 'Unsupported automation type'; end if;
  if requested_payment_method not in ('mobile_money', 'wallet') then raise exception 'Unsupported payment method'; end if;
  if requested_payment_method = 'mobile_money' and nullif(trim(requested_phone_number), '') is null then
    raise exception 'Mobile Money number is required';
  end if;

  if requested_type = 'circle_autopay' then
    select * into target_circle from public.circles where id = requested_circle_id;
    if target_circle.id is null or target_circle.status <> 'active' then raise exception 'Active circle not found'; end if;
    if not exists (
      select 1 from public.circle_members
      where circle_id = target_circle.id and user_id = auth.uid() and status = 'approved'
    ) then raise exception 'Approved circle membership required'; end if;
    resolved_amount := target_circle.contribution_amount;
    resolved_frequency := target_circle.frequency;
    if resolved_amount is null or resolved_amount <= 0 then raise exception 'Circle contribution amount is not configured'; end if;
    if resolved_frequency not in ('weekly', 'biweekly', 'monthly') then raise exception 'Circle frequency is not supported for AutoPay'; end if;
    if requested_amount is not null and requested_amount <> resolved_amount then
      raise exception 'AutoPay cannot change the circle contribution amount';
    end if;
    if requested_frequency is not null and requested_frequency <> resolved_frequency then
      raise exception 'AutoPay cannot change the circle contribution frequency';
    end if;
    event_action := 'autopay_enabled';
  else
    select * into target_plan from public.personal_susu_plans
    where id = requested_piggy_id and user_id = auth.uid();
    if target_plan.id is null or target_plan.status <> 'active' then raise exception 'Active Piggy Bag not found'; end if;
    resolved_amount := requested_amount;
    resolved_frequency := coalesce(requested_frequency, target_plan.frequency);
    if resolved_amount is null or resolved_amount <= 0 then raise exception 'AutoSave amount must be greater than zero'; end if;
    if resolved_frequency not in ('daily', 'weekly', 'biweekly', 'monthly') then raise exception 'Unsupported AutoSave frequency'; end if;
    if resolved_start > target_plan.end_date then raise exception 'AutoSave cannot start after Piggy maturity'; end if;
    event_action := 'autosave_enabled';
  end if;

  insert into public.payment_automations(
    user_id, automation_type, circle_id, piggy_id, amount, frequency,
    payment_method, phone_number, status, authorization_status,
    next_collection_date, max_retries
  ) values (
    auth.uid(), requested_type, requested_circle_id, requested_piggy_id, resolved_amount, resolved_frequency,
    requested_payment_method, nullif(trim(requested_phone_number), ''), 'active',
    case when requested_payment_method = 'wallet' then 'not_required' else 'pending' end,
    resolved_start, least(greatest(coalesce(requested_max_retries, 2), 0), 10)
  )
  returning * into created_automation;

  insert into public.scheduled_payments(
    automation_id, user_id, circle_id, piggy_id, contribution_id, payment_type, amount, due_date, status
  ) values (
    created_automation.id, created_automation.user_id, created_automation.circle_id, created_automation.piggy_id,
    case when requested_type = 'circle_autopay' then (
      select id from public.contributions
      where circle_id = created_automation.circle_id
        and user_id = created_automation.user_id
        and due_date::date = created_automation.next_collection_date
        and status not in ('paid', 'processed')
      order by created_at limit 1
    ) else null end,
    case when requested_type = 'circle_autopay' then 'circle_contribution' else 'piggy_autosave' end,
    created_automation.amount, created_automation.next_collection_date,
    case when created_automation.next_collection_date <= current_date then 'due' else 'scheduled' end
  ) on conflict (automation_id, due_date) do nothing;

  perform public.record_automation_audit(auth.uid(), event_action, created_automation.id, jsonb_build_object(
    'amount', created_automation.amount,
    'frequency', created_automation.frequency,
    'payment_method', created_automation.payment_method
  ));
  return created_automation;
end;
$$;

create or replace function public.set_payment_automation_status(
  check_automation_id uuid,
  requested_action text
)
returns public.payment_automations
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.payment_automations;
  event_action text;
begin
  select * into target from public.payment_automations
  where id = check_automation_id for update;
  if target.id is null or target.user_id <> auth.uid() then raise exception 'Automation not found'; end if;

  if requested_action = 'pause' and target.status = 'active' then
    update public.payment_automations set status = 'paused', paused_at = now(), updated_at = now()
    where id = target.id returning * into target;
    event_action := case when target.automation_type = 'circle_autopay' then 'autopay_paused' else 'autosave_paused' end;
  elsif requested_action = 'resume' and target.status = 'paused' then
    update public.payment_automations set status = 'active', paused_at = null, updated_at = now()
    where id = target.id returning * into target;
    event_action := case when target.automation_type = 'circle_autopay' then 'autopay_resumed' else 'autosave_resumed' end;
  elsif requested_action = 'cancel' and target.status in ('active', 'paused') then
    update public.payment_automations
    set status = 'cancelled', cancelled_at = now(), authorization_status =
      case when authorization_status = 'authorized' then 'revoked' else authorization_status end,
      updated_at = now()
    where id = target.id returning * into target;
    update public.scheduled_payments
    set status = 'cancelled', updated_at = now()
    where automation_id = target.id and status in ('scheduled', 'due', 'failed', 'retry_scheduled');
    event_action := case when target.automation_type = 'circle_autopay' then 'autopay_cancelled' else 'autosave_cancelled' end;
  else
    raise exception 'Action is not valid for the current automation status';
  end if;

  perform public.record_automation_audit(auth.uid(), event_action, target.id);
  return target;
end;
$$;

create or replace function public.generate_scheduled_payments(as_of_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  automation public.payment_automations;
  generated integer := 0;
  inserted_count integer;
  next_date date;
  plan_end date;
begin
  if auth.role() <> 'service_role' and public.current_user_staff_role() is null then
    raise exception 'Server or staff access required';
  end if;

  for automation in
    select * from public.payment_automations
    where status = 'active' and next_collection_date <= as_of_date + 35
    for update skip locked
  loop
    next_date := automation.next_collection_date;
    if automation.piggy_id is not null then
      select end_date into plan_end from public.personal_susu_plans where id = automation.piggy_id;
    else
      plan_end := null;
    end if;

    while next_date <= as_of_date + 35 and (plan_end is null or next_date <= plan_end) loop
      insert into public.scheduled_payments(
        automation_id, user_id, circle_id, piggy_id, contribution_id, payment_type, amount, due_date, status
      ) values (
        automation.id, automation.user_id, automation.circle_id, automation.piggy_id,
        case when automation.automation_type = 'circle_autopay' then (
          select id from public.contributions
          where circle_id = automation.circle_id
            and user_id = automation.user_id
            and due_date::date = next_date
            and status not in ('paid', 'processed')
          order by created_at limit 1
        ) else null end,
        case when automation.automation_type = 'circle_autopay' then 'circle_contribution' else 'piggy_autosave' end,
        automation.amount, next_date, case when next_date <= as_of_date then 'due' else 'scheduled' end
      ) on conflict (automation_id, due_date) do nothing;
      get diagnostics inserted_count = row_count;
      generated := generated + inserted_count;
      if inserted_count > 0 then
        perform public.record_automation_audit(null, 'scheduled_payment_created', automation.id, jsonb_build_object('due_date', next_date));
      end if;
      next_date := public.automation_next_date(next_date, automation.frequency);
    end loop;

    update public.payment_automations
    set next_collection_date = next_date, updated_at = now()
    where id = automation.id;
  end loop;
  return generated;
end;
$$;

create or replace function public.generate_payment_reminders(as_of_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  created_count integer := 0;
  affected integer;
begin
  if auth.role() <> 'service_role' and public.current_user_staff_role() is null then
    raise exception 'Server or staff access required';
  end if;

  insert into public.notifications(user_id, circle_id, automation_id, scheduled_payment_id, type, title, body)
  select sp.user_id, sp.circle_id, sp.automation_id, sp.id, 'payment_due_tomorrow',
    'Scheduled payment due tomorrow',
    'Your scheduled ' || to_char(sp.amount, 'FM999999990.00') || ' GHS payment is due tomorrow.'
  from public.scheduled_payments sp
  where sp.due_date = as_of_time::date + 1
    and sp.status = 'scheduled'
  on conflict (scheduled_payment_id, type, user_id) where scheduled_payment_id is not null do nothing;
  get diagnostics affected = row_count;
  created_count := created_count + affected;

  insert into public.notifications(user_id, circle_id, automation_id, scheduled_payment_id, type, title, body)
  select sp.user_id, sp.circle_id, sp.automation_id, sp.id, 'payment_due_today',
    'Scheduled payment due today',
    'Your scheduled ' || to_char(sp.amount, 'FM999999990.00') || ' GHS payment is due today. Authorize payment when prompted.'
  from public.scheduled_payments sp
  where sp.due_date = as_of_time::date
    and sp.status in ('scheduled', 'due')
  on conflict (scheduled_payment_id, type, user_id) where scheduled_payment_id is not null do nothing;
  get diagnostics affected = row_count;
  created_count := created_count + affected;

  update public.scheduled_payments
  set status = 'due', updated_at = now()
  where due_date <= as_of_time::date and status = 'scheduled';
  return created_count;
end;
$$;

create or replace function public.record_scheduled_payment_result(
  check_scheduled_payment_id uuid,
  result_status text,
  check_payment_transaction_id uuid default null,
  check_provider_reference text default null,
  check_failure_reason text default null,
  retry_delay interval default interval '24 hours'
)
returns public.scheduled_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.scheduled_payments;
  automation public.payment_automations;
  transaction_row public.payment_transactions;
  next_status text;
begin
  if auth.role() <> 'service_role' and public.current_user_staff_role() is null then
    raise exception 'Server or staff access required';
  end if;
  select * into target from public.scheduled_payments where id = check_scheduled_payment_id for update;
  if target.id is null or target.status not in ('due', 'processing', 'failed', 'retry_scheduled', 'overdue') then
    raise exception 'Scheduled payment is not eligible for a result';
  end if;
  select * into automation from public.payment_automations where id = target.automation_id for update;

  if result_status = 'successful' then
    if check_payment_transaction_id is null then raise exception 'Confirmed transaction is required'; end if;
    select * into transaction_row from public.payment_transactions where id = check_payment_transaction_id;
    if transaction_row.id is null or transaction_row.status <> 'successful'
      or transaction_row.user_id <> target.user_id or transaction_row.amount <> target.amount then
      raise exception 'Payment transaction is not confirmed for this scheduled payment';
    end if;
    next_status := 'successful';
    update public.payment_automations set
      last_collection_date = current_date,
      last_successful_collection_date = current_date,
      retry_count = 0,
      failure_reason = null,
      updated_at = now()
    where id = automation.id;
  elsif result_status = 'failed' then
    if target.attempt_count < automation.max_retries then
      next_status := 'retry_scheduled';
    else
      next_status := 'overdue';
    end if;
    update public.payment_automations set
      last_collection_date = current_date,
      last_failed_collection_date = current_date,
      retry_count = target.attempt_count,
      failure_reason = check_failure_reason,
      updated_at = now()
    where id = automation.id;
  else
    raise exception 'Unsupported scheduled payment result';
  end if;

  update public.scheduled_payments set
    status = next_status,
    attempt_count = case when result_status = 'failed' then attempt_count + 1 else attempt_count end,
    payment_transaction_id = coalesce(check_payment_transaction_id, payment_transaction_id),
    provider_reference = coalesce(check_provider_reference, provider_reference),
    last_attempt_at = now(),
    next_retry_at = case when next_status = 'retry_scheduled' then now() + retry_delay else null end,
    failure_reason = check_failure_reason,
    updated_at = now()
  where id = target.id returning * into target;

  insert into public.notifications(user_id, circle_id, automation_id, scheduled_payment_id, type, title, body)
  values (
    target.user_id,
    target.circle_id,
    automation.id,
    target.id,
    case when next_status = 'successful' then 'payment_successful'
         when next_status = 'retry_scheduled' then 'payment_failed'
         else 'payment_overdue' end,
    case when next_status = 'successful' then 'Scheduled payment received'
         when next_status = 'retry_scheduled' then 'Scheduled payment failed'
         else 'Scheduled payment overdue' end,
    case when next_status = 'successful'
           then format('Your scheduled GH₵%s payment was received successfully.', trim(to_char(target.amount, 'FM999999990.00')))
         when next_status = 'retry_scheduled'
           then format('We could not collect GH₵%s. We will retry this scheduled payment.', trim(to_char(target.amount, 'FM999999990.00')))
         else format('Your GH₵%s payment is overdue. Pay now using the existing payment flow.', trim(to_char(target.amount, 'FM999999990.00'))) end
  )
  on conflict do nothing;

  if next_status = 'retry_scheduled' then
    insert into public.notifications(user_id, circle_id, automation_id, scheduled_payment_id, type, title, body)
    values (
      target.user_id, target.circle_id, automation.id, target.id,
      'payment_retry_scheduled', 'Payment retry scheduled',
      format('We will retry your scheduled GH₵%s payment after the configured delay.', trim(to_char(target.amount, 'FM999999990.00')))
    )
    on conflict do nothing;
  end if;

  if result_status = 'failed' then
    perform public.record_automation_audit(null, 'payment_failed', automation.id,
      jsonb_build_object('scheduled_payment_id', target.id, 'reason', check_failure_reason));
  end if;
  perform public.record_automation_audit(null,
    case when next_status = 'successful' then 'payment_successful'
         when next_status = 'retry_scheduled' then 'payment_retry_scheduled'
         else 'payment_overdue' end,
    automation.id, jsonb_build_object('scheduled_payment_id', target.id, 'reason', check_failure_reason));
  return target;
end;
$$;

create or replace function public.get_automation_admin_summary()
returns table(status text, payment_count bigint, total_amount numeric)
language sql
security definer
set search_path = public
as $$
  select sp.status, count(*), coalesce(sum(sp.amount), 0)
  from public.scheduled_payments sp
  where public.current_user_staff_role() is not null
  group by sp.status;
$$;

create or replace function public.link_confirmed_transaction_to_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  scheduled_id uuid;
  plan_id uuid;
begin
  if new.status <> 'successful' or old.status = 'successful' then return new; end if;
  plan_id := nullif(coalesce(new.provider_response->>'planId', new.provider_response->>'plan_id'), '')::uuid;

  select sp.id into scheduled_id
  from public.scheduled_payments sp
  where sp.user_id = new.user_id
    and sp.amount = new.amount
    and sp.status in ('due', 'processing', 'failed', 'retry_scheduled', 'overdue')
    and (
      (new.contribution_id is not null and sp.contribution_id = new.contribution_id)
      or (plan_id is not null and sp.piggy_id = plan_id)
    )
  order by sp.due_date
  limit 1;

  if scheduled_id is not null then
    perform public.record_scheduled_payment_result(
      scheduled_id, 'successful', new.id, new.provider_reference, null, interval '24 hours'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists payment_transaction_schedule_confirmation on public.payment_transactions;
create trigger payment_transaction_schedule_confirmation
after update of status on public.payment_transactions
for each row execute function public.link_confirmed_transaction_to_schedule();

create or replace function public.prepare_due_scheduled_payments(as_of_time timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer := 0;
  changed integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Service access required'; end if;
  update public.scheduled_payments
  set status = 'due', updated_at = now()
  where (status = 'scheduled' and due_date <= as_of_time::date)
     or (status = 'retry_scheduled' and next_retry_at <= as_of_time);
  get diagnostics affected = row_count;

  update public.scheduled_payments sp
  set status = 'overdue', updated_at = now()
  from public.payment_automations pa
  where sp.automation_id = pa.id
    and sp.status = 'failed'
    and sp.attempt_count > pa.max_retries;
  get diagnostics changed = row_count;
  return affected + changed;
end;
$$;

revoke all on function public.automation_next_date(date, text) from public, anon, authenticated;
revoke all on function public.record_automation_audit(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.enable_payment_automation(text, uuid, uuid, numeric, text, text, text, date, integer) from public, anon;
revoke all on function public.set_payment_automation_status(uuid, text) from public, anon;
revoke all on function public.generate_scheduled_payments(date) from public, anon, authenticated;
revoke all on function public.generate_payment_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.record_scheduled_payment_result(uuid, text, uuid, text, text, interval) from public, anon, authenticated;
revoke all on function public.get_automation_admin_summary() from public, anon;
revoke all on function public.link_confirmed_transaction_to_schedule() from public, anon, authenticated;
revoke all on function public.prepare_due_scheduled_payments(timestamptz) from public, anon, authenticated;
revoke insert, update, delete on public.payment_automations, public.scheduled_payments from anon, authenticated;

grant execute on function public.enable_payment_automation(text, uuid, uuid, numeric, text, text, text, date, integer) to authenticated;
grant execute on function public.set_payment_automation_status(uuid, text) to authenticated;
grant execute on function public.generate_scheduled_payments(date) to service_role;
grant execute on function public.generate_payment_reminders(timestamptz) to service_role;
grant execute on function public.record_scheduled_payment_result(uuid, text, uuid, text, text, interval) to service_role;
grant execute on function public.get_automation_admin_summary() to authenticated;
grant execute on function public.prepare_due_scheduled_payments(timestamptz) to service_role;

notify pgrst, 'reload schema';
