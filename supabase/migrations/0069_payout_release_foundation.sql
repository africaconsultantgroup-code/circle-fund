-- Working Group 3: payout/release foundation.
-- Production remains preview-only. This migration cannot send or release money.

create table public.payout_execution_settings (
  singleton boolean primary key default true check (singleton),
  execution_mode text not null default 'preview'
    check (execution_mode in ('preview', 'manual_review', 'live')),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  retry_delay interval not null default interval '24 hours',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.payout_execution_settings(singleton, execution_mode)
values (true, 'preview');

create table public.fund_releases (
  id uuid primary key default gen_random_uuid(),
  release_reference text not null unique
    default ('SCPO-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
  release_type text not null check (release_type in ('circle_payout', 'piggy_maturity')),
  circle_id uuid references public.circles(id) on delete restrict,
  piggy_id uuid references public.personal_susu_plans(id) on delete restrict,
  beneficiary_user_id uuid not null references auth.users(id) on delete restrict,
  payout_schedule_id uuid references public.payout_schedule(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'GHS',
  status text not null default 'release_pending' check (status in (
    'eligible', 'release_pending', 'provider_processing', 'provider_failed',
    'provider_status_unknown', 'retry_pending', 'released', 'blocked', 'cancelled'
  )),
  payment_destination_type text not null check (
    payment_destination_type in ('mobile_money', 'bank_account', 'wallet')
  ),
  payment_destination_reference text not null,
  provider text not null default 'hubtel',
  provider_reference text,
  provider_request_reference text,
  provider_status text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 2 check (max_attempts between 1 and 5),
  last_attempt_at timestamptz,
  next_retry_at timestamptz,
  failure_code text,
  failure_reason text,
  initiated_at timestamptz,
  provider_confirmed_at timestamptz,
  released_at timestamptz,
  cancelled_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  is_test_record boolean not null default false,
  execution_blocked boolean not null default false,
  blocking_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fund_releases_target_check check (
    (release_type = 'circle_payout' and circle_id is not null and piggy_id is null
      and payout_schedule_id is not null)
    or
    (release_type = 'piggy_maturity' and piggy_id is not null and circle_id is null
      and payout_schedule_id is null)
  ),
  constraint fund_releases_released_confirmation_check check (
    status <> 'released'
    or (provider_confirmed_at is not null and released_at is not null
      and provider_reference is not null)
  )
);

create unique index fund_releases_circle_success_key
  on public.fund_releases(payout_schedule_id)
  where payout_schedule_id is not null
    and status not in ('cancelled');
create unique index fund_releases_piggy_success_key
  on public.fund_releases(piggy_id)
  where piggy_id is not null
    and status not in ('cancelled');
create unique index fund_releases_provider_reference_key
  on public.fund_releases(provider, provider_reference)
  where provider_reference is not null;
create index fund_releases_status_retry_idx
  on public.fund_releases(status, next_retry_at, created_at);
create index fund_releases_beneficiary_idx
  on public.fund_releases(beneficiary_user_id, created_at desc);

create table public.fund_release_allocations (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null references public.fund_releases(id) on delete restrict,
  protected_fund_ledger_id uuid not null
    references public.protected_fund_ledger(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (release_id, protected_fund_ledger_id),
  unique (protected_fund_ledger_id)
);

create index fund_release_allocations_release_idx
  on public.fund_release_allocations(release_id);

create table public.payout_receipts (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references public.fund_releases(id) on delete restrict,
  receipt_reference text not null unique,
  beneficiary_user_id uuid not null references auth.users(id) on delete restrict,
  release_type text not null,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null,
  payment_method text not null,
  provider text not null,
  provider_reference text not null,
  status text not null default 'released' check (status = 'released'),
  issued_at timestamptz not null default now()
);

create table public.payout_reconciliation_queue (
  id uuid primary key default gen_random_uuid(),
  release_id uuid references public.fund_releases(id) on delete restrict,
  issue_type text not null,
  severity text not null default 'warning'
    check (severity in ('warning', 'critical')),
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_notes text
);

create unique index payout_reconciliation_open_issue_key
  on public.payout_reconciliation_queue(release_id, issue_type)
  where release_id is not null and status in ('open', 'investigating');

alter table public.fund_releases enable row level security;
alter table public.fund_release_allocations enable row level security;
alter table public.payout_receipts enable row level security;
alter table public.payout_reconciliation_queue enable row level security;
alter table public.payout_execution_settings enable row level security;

create policy "Fund releases: beneficiaries view own"
  on public.fund_releases for select
  using (beneficiary_user_id = auth.uid());
create policy "Fund releases: Circle members view relevant"
  on public.fund_releases for select
  using (
    circle_id is not null and exists (
      select 1 from public.circle_members cm
      where cm.circle_id = fund_releases.circle_id
        and cm.user_id = auth.uid() and cm.status = 'approved'
    )
  );
create policy "Fund releases: staff view"
  on public.fund_releases for select
  using (public.current_user_staff_role() is not null);
create policy "Release allocations: permitted viewers"
  on public.fund_release_allocations for select
  using (
    exists (
      select 1 from public.fund_releases fr
      where fr.id = fund_release_allocations.release_id
        and (
          fr.beneficiary_user_id = auth.uid()
          or public.current_user_staff_role() is not null
          or (
            fr.circle_id is not null and exists (
              select 1 from public.circle_members cm
              where cm.circle_id = fr.circle_id
                and cm.user_id = auth.uid() and cm.status = 'approved'
            )
          )
        )
    )
  );
create policy "Payout receipts: beneficiaries view own"
  on public.payout_receipts for select
  using (beneficiary_user_id = auth.uid());
create policy "Payout receipts: staff view"
  on public.payout_receipts for select
  using (public.current_user_staff_role() is not null);
create policy "Payout reconciliation: staff view"
  on public.payout_reconciliation_queue for select
  using (public.current_user_staff_role() is not null);
create policy "Payout settings: staff view"
  on public.payout_execution_settings for select
  using (public.current_user_staff_role() is not null);

revoke insert, update, delete on public.fund_releases,
  public.fund_release_allocations, public.payout_receipts,
  public.payout_reconciliation_queue, public.payout_execution_settings
  from anon, authenticated;
revoke execute on function public.manual_trigger_payout(uuid, text)
  from public, anon, authenticated;
revoke execute on function public.process_due_payouts_placeholder()
  from public, anon, authenticated;
revoke execute on function public.receive_payout_to_wallet(uuid)
  from public, anon, authenticated;

-- The known unmatched GHS 100 payment is explicitly excluded and remains
-- reconciliation-only. It is not a protected fund and cannot become a candidate.
update public.protection_reconciliation_queue q
set details = q.details || jsonb_build_object(
      'payout_excluded', true,
      'payout_exclusion_reason', 'NO_MATCH: no Piggy plan, deposit, or beneficiary',
      'excluded_by_migration', '0069'
    )
where q.source_payment_transaction_id =
    '8a37fed5-96db-45ba-8e60-9d29cc216bb1'::uuid
  and q.issue_type = 'ambiguous_piggy_payment';

create or replace function public.protected_fund_is_test_record(
  check_fund public.protected_fund_ledger
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(check_fund.metadata->>'test_record', '') = 'true'
    or exists (
      select 1 from public.payment_transactions pt
      where pt.id = check_fund.source_payment_transaction_id
        and (
          lower(coalesce(pt.provider_response->>'payment_env', '')) = 'sandbox'
          or lower(coalesce(pt.provider_response->>'mode', '')) = 'sandbox'
          or lower(coalesce(pt.provider_response->>'label', '')) like '%test%'
        )
    )
    or exists (
      select 1 from public.wallet_transactions wt
      where wt.id = check_fund.source_transaction_id
        and (
          lower(coalesce(wt.metadata->>'payment_env', '')) = 'sandbox'
          or lower(coalesce(wt.metadata->>'mode', '')) = 'sandbox'
          or lower(coalesce(wt.metadata->>'label', '')) like '%test%'
        )
    );
$$;

create or replace function public.mask_payout_destination(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null or length(value) < 7 then null
    else left(value, 3) || repeat('*', greatest(length(value) - 6, 3)) || right(value, 3)
  end;
$$;

create or replace function public.get_payout_preview(as_of_date date default current_date)
returns table (
  candidate_key text,
  release_type text,
  circle_id uuid,
  piggy_id uuid,
  payout_schedule_id uuid,
  beneficiary_user_id uuid,
  amount numeric,
  currency text,
  maturity_date date,
  protected_funds_available numeric,
  frozen_amount numeric,
  already_allocated numeric,
  payment_destination_type text,
  payment_destination_summary text,
  eligibility text,
  blocking_reason text,
  is_test_record boolean
)
language sql
security definer
stable
set search_path = public
as $$
  with protected_available as (
    select
      pf.*,
      public.protected_fund_is_test_record(pf) as test_record,
      exists (
        select 1
        from public.fund_release_allocations fra
        join public.fund_releases fr on fr.id = fra.release_id
        where fra.protected_fund_ledger_id = pf.id
          and fr.status <> 'cancelled'
      ) as allocated
    from public.protected_fund_ledger pf
    where pf.status <> 'released'
  ),
  circle_candidates as (
    select
      'circle:' || ps.id::text candidate_key,
      'circle_payout'::text release_type,
      ps.circle_id,
      null::uuid piggy_id,
      ps.id payout_schedule_id,
      cm.user_id beneficiary_user_id,
      ps.payout_amount amount,
      coalesce(c.base_currency::text, 'GHS') currency,
      ps.payout_due_date::date maturity_date,
      coalesce(sum(pf.amount) filter (
        where pf.status in ('protected', 'matured')
          and pf.maturity_date <= as_of_date and not pf.allocated
      ), 0) protected_funds_available,
      coalesce(sum(pf.amount) filter (where pf.status = 'frozen'), 0) frozen_amount,
      coalesce(sum(pf.amount) filter (where pf.allocated), 0) already_allocated,
      'mobile_money'::text payment_destination_type,
      public.mask_payout_destination(uv.phone_number) payment_destination_summary,
      bool_or(coalesce(pf.test_record, false)) is_test_record,
      count(pf.id) filter (
        where pf.status in ('protected', 'matured')
          and pf.maturity_date <= as_of_date and not pf.allocated
      ) eligible_fund_count,
      cm.status member_status,
      uv.phone_verified and uv.otp_status::text = 'verified' destination_verified,
      exists (
        select 1 from public.protection_reconciliation_queue prq
        where prq.status in ('open', 'investigating')
          and (
            exists (
              select 1 from protected_available linked_fund
              where linked_fund.circle_id = ps.circle_id
                and linked_fund.beneficiary_user_id = cm.user_id
                and linked_fund.maturity_date = ps.payout_due_date::date
                and linked_fund.id = prq.protected_fund_id
            )
            or prq.details->>'circle_id' = ps.circle_id::text
          )
      ) reconciliation_block,
      exists (
        select 1 from public.fund_releases fr
        where fr.payout_schedule_id = ps.id and fr.status <> 'cancelled'
      ) existing_release
    from public.payout_schedule ps
    join public.circles c on c.id = ps.circle_id
    join public.circle_members cm on cm.id = ps.member_id
    left join public.user_verifications uv on uv.user_id = cm.user_id
    left join protected_available pf
      on pf.circle_id = ps.circle_id
      and pf.beneficiary_user_id = cm.user_id
      and pf.maturity_date = ps.payout_due_date::date
    group by ps.id, ps.circle_id, cm.user_id, cm.status, ps.payout_amount,
      c.base_currency, ps.payout_due_date, uv.phone_number,
      uv.phone_verified, uv.otp_status
  ),
  piggy_candidates as (
    select
      'piggy:' || p.id::text candidate_key,
      'piggy_maturity'::text release_type,
      null::uuid circle_id,
      p.id piggy_id,
      null::uuid payout_schedule_id,
      p.user_id beneficiary_user_id,
      coalesce(sum(pf.amount) filter (
        where pf.status in ('protected', 'matured')
          and pf.maturity_date <= as_of_date and not pf.allocated
      ), 0) amount,
      coalesce(max(pf.currency), 'GHS') currency,
      coalesce(p.locked_until, p.end_date) maturity_date,
      coalesce(sum(pf.amount) filter (
        where pf.status in ('protected', 'matured')
          and pf.maturity_date <= as_of_date and not pf.allocated
      ), 0) protected_funds_available,
      coalesce(sum(pf.amount) filter (where pf.status = 'frozen'), 0) frozen_amount,
      coalesce(sum(pf.amount) filter (where pf.allocated), 0) already_allocated,
      'mobile_money'::text payment_destination_type,
      public.mask_payout_destination(uv.phone_number) payment_destination_summary,
      bool_or(coalesce(pf.test_record, false)) is_test_record,
      count(pf.id) filter (
        where pf.status in ('protected', 'matured')
          and pf.maturity_date <= as_of_date and not pf.allocated
      ) eligible_fund_count,
      'approved'::text member_status,
      uv.phone_verified and uv.otp_status::text = 'verified' destination_verified,
      exists (
        select 1 from public.protection_reconciliation_queue prq
        where prq.status in ('open', 'investigating')
          and (
            exists (
              select 1 from protected_available linked_fund
              where linked_fund.piggy_id = p.id
                and linked_fund.id = prq.protected_fund_id
            )
            or prq.details->>'plan_id' = p.id::text
          )
      ) reconciliation_block,
      exists (
        select 1 from public.fund_releases fr
        where fr.piggy_id = p.id and fr.status <> 'cancelled'
      ) existing_release
    from public.personal_susu_plans p
    join protected_available pf on pf.piggy_id = p.id
    left join public.user_verifications uv on uv.user_id = p.user_id
    group by p.id, p.user_id, p.locked_until, p.end_date,
      uv.phone_number, uv.phone_verified, uv.otp_status
  ),
  classified as (
    select *,
      case
        when is_test_record then 'BLOCKED_TEST_RECORD'
        when maturity_date is null or maturity_date > as_of_date then 'BLOCKED_NOT_MATURED'
        when existing_release then 'BLOCKED_ALREADY_RELEASED'
        when member_status <> 'approved' then 'BLOCKED_NO_BENEFICIARY'
        when reconciliation_block then 'BLOCKED_RECONCILIATION'
        when frozen_amount > 0 then 'BLOCKED_FROZEN'
        when not coalesce(destination_verified, false) then 'BLOCKED_NO_DESTINATION'
        when eligible_fund_count = 0 or protected_funds_available < amount
          then 'BLOCKED_INSUFFICIENT_FUNDS'
        else 'READY'
      end eligibility
    from circle_candidates
    union all
    select *,
      case
        when is_test_record then 'BLOCKED_TEST_RECORD'
        when maturity_date is null or maturity_date > as_of_date then 'BLOCKED_NOT_MATURED'
        when existing_release then 'BLOCKED_ALREADY_RELEASED'
        when reconciliation_block then 'BLOCKED_RECONCILIATION'
        when frozen_amount > 0 then 'BLOCKED_FROZEN'
        when not coalesce(destination_verified, false) then 'BLOCKED_NO_DESTINATION'
        when eligible_fund_count = 0 or protected_funds_available <= 0
          then 'BLOCKED_INSUFFICIENT_FUNDS'
        else 'READY'
      end eligibility
    from piggy_candidates
  )
  select
    candidate_key, release_type, circle_id, piggy_id, payout_schedule_id,
    beneficiary_user_id, amount, currency, maturity_date,
    protected_funds_available, frozen_amount, already_allocated,
    payment_destination_type, payment_destination_summary, eligibility,
    case eligibility
      when 'READY' then null
      when 'BLOCKED_TEST_RECORD' then 'Historical or sandbox funds require explicit verification.'
      when 'BLOCKED_NOT_MATURED' then 'Maturity date has not arrived.'
      when 'BLOCKED_ALREADY_RELEASED' then 'A release already exists for this target.'
      when 'BLOCKED_NO_BENEFICIARY' then 'No valid approved beneficiary exists.'
      when 'BLOCKED_RECONCILIATION' then 'An unresolved protection issue blocks release.'
      when 'BLOCKED_FROZEN' then 'One or more protected funds are frozen.'
      when 'BLOCKED_NO_DESTINATION' then 'No verified payout destination exists.'
      when 'BLOCKED_INSUFFICIENT_FUNDS' then 'Legitimately protected funds are insufficient.'
      else 'Eligibility could not be proven.'
    end,
    is_test_record
  from classified
  where auth.role() = 'service_role'
     or public.current_user_staff_role() is not null
     or beneficiary_user_id = auth.uid()
     or (
       circle_id is not null and exists (
         select 1 from public.circle_members viewer
         where viewer.circle_id = classified.circle_id
           and viewer.user_id = auth.uid() and viewer.status = 'approved'
       )
     );
$$;

-- Only a server/staff-controlled READY preview may reserve protected funds.
create or replace function public.create_fund_release_from_preview(candidate text)
returns public.fund_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text := public.current_user_staff_role();
  mode text;
  preview record;
  created_release public.fund_releases;
  fund public.protected_fund_ledger;
  allocated numeric := 0;
begin
  if staff_role not in ('super_admin', 'finance') and auth.role() <> 'service_role' then
    raise exception 'Finance or server access required';
  end if;
  select execution_mode into mode from public.payout_execution_settings where singleton;
  if mode = 'preview' then raise exception 'Payout execution is preview-only'; end if;
  select * into preview from public.get_payout_preview(current_date)
  where candidate_key = candidate;
  if preview.candidate_key is null or preview.eligibility <> 'READY' then
    raise exception 'Only a READY payout candidate can create a release';
  end if;
  insert into public.fund_releases(
    release_type, circle_id, piggy_id, beneficiary_user_id, payout_schedule_id,
    amount, currency, status, payment_destination_type,
    payment_destination_reference, max_attempts, is_test_record,
    execution_blocked, blocking_reason
  )
  select
    preview.release_type, preview.circle_id, preview.piggy_id,
    preview.beneficiary_user_id, preview.payout_schedule_id,
    preview.amount, preview.currency, 'release_pending',
    'mobile_money', uv.phone_number, settings.max_attempts,
    preview.is_test_record, preview.is_test_record,
    case when preview.is_test_record then 'Test records cannot execute' end
  from public.user_verifications uv
  cross join public.payout_execution_settings settings
  where uv.user_id = preview.beneficiary_user_id
    and uv.phone_verified and uv.otp_status::text = 'verified'
  returning * into created_release;
  if created_release.id is null then raise exception 'Verified destination not found'; end if;

  for fund in
    select pf.*
    from public.protected_fund_ledger pf
    where pf.user_id is not null
      and pf.status in ('protected', 'matured')
      and pf.status <> 'frozen'
      and pf.maturity_date <= current_date
      and not public.protected_fund_is_test_record(pf)
      and (
        (preview.release_type = 'circle_payout'
          and pf.circle_id = preview.circle_id
          and pf.beneficiary_user_id = preview.beneficiary_user_id
          and pf.maturity_date = preview.maturity_date)
        or
        (preview.release_type = 'piggy_maturity' and pf.piggy_id = preview.piggy_id)
      )
      and not exists (
        select 1 from public.fund_release_allocations fra
        where fra.protected_fund_ledger_id = pf.id
      )
    order by pf.protected_at, pf.id
    for update skip locked
  loop
    exit when allocated >= created_release.amount;
    if allocated + fund.amount > created_release.amount then
      raise exception 'Partial protected-fund allocation is not supported safely';
    end if;
    insert into public.fund_release_allocations(
      release_id, protected_fund_ledger_id, amount
    ) values (created_release.id, fund.id, fund.amount);
    allocated := allocated + fund.amount;
  end loop;
  if allocated <> created_release.amount then
    raise exception 'Release allocations do not equal the authoritative release amount';
  end if;
  insert into public.audit_logs(
    staff_user_id, action, target_type, target_id, notes, metadata
  ) values (
    case when auth.role() = 'service_role' then null else auth.uid() end,
    'release_created', 'fund_release', created_release.id,
    'Eligible payout release created; funds remain protected and reserved.',
    jsonb_build_object(
      'amount', created_release.amount,
      'beneficiary_user_id', created_release.beneficiary_user_id,
      'circle_id', created_release.circle_id,
      'piggy_id', created_release.piggy_id,
      'execution_mode', mode
    )
  );
  return created_release;
exception when unique_violation then
  select * into created_release from public.fund_releases fr
  where (preview.payout_schedule_id is not null
      and fr.payout_schedule_id = preview.payout_schedule_id)
     or (preview.piggy_id is not null and fr.piggy_id = preview.piggy_id)
  order by fr.created_at desc limit 1;
  return created_release;
end;
$$;

create or replace function public.record_payout_provider_result(
  check_release_id uuid,
  result_status text,
  check_provider_reference text default null,
  check_failure_code text default null,
  check_failure_reason text default null
)
returns public.fund_releases
language plpgsql
security definer
set search_path = public
as $$
declare
  release_record public.fund_releases;
  settings public.payout_execution_settings;
  allocated_total numeric;
  released_event_count integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Trusted server access required';
  end if;
  select * into settings
  from public.payout_execution_settings where singleton;
  if settings.execution_mode <> 'live' then
    raise exception 'Provider results cannot be recorded outside live mode';
  end if;

  select * into release_record
  from public.fund_releases
  where id = check_release_id
  for update;
  if release_record.id is null then raise exception 'Release not found'; end if;
  if release_record.execution_blocked or release_record.is_test_record then
    raise exception 'Blocked/test releases cannot enter provider processing';
  end if;

  if release_record.status = 'released' then
    insert into public.audit_logs(
      staff_user_id, action, target_type, target_id, notes, metadata
    ) values (
      null, 'duplicate_callback_blocked', 'fund_release', release_record.id,
      'Duplicate provider callback was ignored.',
      jsonb_build_object('provider_reference', check_provider_reference)
    );
    return release_record;
  end if;

  if result_status = 'processing' then
    update public.fund_releases
    set status = 'provider_processing',
        provider_request_reference = coalesce(provider_request_reference, check_provider_reference),
        provider_status = 'processing',
        attempt_count = attempt_count + 1,
        last_attempt_at = now(),
        initiated_at = coalesce(initiated_at, now()),
        updated_at = now()
    where id = release_record.id
    returning * into release_record;
  elsif result_status = 'failed' then
    update public.fund_releases
    set status = case
          when attempt_count < max_attempts then 'retry_pending'
          else 'provider_failed'
        end,
        provider_status = 'failed',
        failure_code = check_failure_code,
        failure_reason = check_failure_reason,
        next_retry_at = case
          when attempt_count < max_attempts then now() + settings.retry_delay
          else null
        end,
        updated_at = now()
    where id = release_record.id
    returning * into release_record;
  elsif result_status = 'unknown' then
    update public.fund_releases
    set status = 'provider_status_unknown',
        provider_status = 'unknown',
        failure_code = check_failure_code,
        failure_reason = check_failure_reason,
        next_retry_at = null,
        updated_at = now()
    where id = release_record.id
    returning * into release_record;
  elsif result_status = 'successful' then
    if nullif(trim(check_provider_reference), '') is null then
      raise exception 'Trusted provider reference is required for release confirmation';
    end if;
    if release_record.status not in ('provider_processing', 'provider_status_unknown') then
      raise exception 'Release must have a provider attempt before confirmation';
    end if;
    select coalesce(sum(fra.amount), 0) into allocated_total
    from public.fund_release_allocations fra
    where fra.release_id = release_record.id;
    if allocated_total <> release_record.amount then
      raise exception 'Protected allocations do not equal release amount';
    end if;
    if exists (
      select 1
      from public.fund_release_allocations fra
      join public.protected_fund_ledger pf
        on pf.id = fra.protected_fund_ledger_id
      where fra.release_id = release_record.id
        and pf.status not in ('protected', 'matured')
    ) then
      raise exception 'A protected allocation is frozen, released, or otherwise unavailable';
    end if;

    update public.protected_fund_ledger pf
    set status = 'released',
        released_at = now(),
        updated_at = now()
    from public.fund_release_allocations fra
    where fra.release_id = release_record.id
      and fra.protected_fund_ledger_id = pf.id;

    insert into public.protected_fund_events(
      protected_fund_id, event_type, amount, reason, metadata
    )
    select
      fra.protected_fund_ledger_id, 'release', fra.amount,
      'Trusted provider confirmed payout.',
      jsonb_build_object(
        'release_id', release_record.id,
        'provider_reference', check_provider_reference
      )
    from public.fund_release_allocations fra
    where fra.release_id = release_record.id
      and not exists (
        select 1 from public.protected_fund_events pfe
        where pfe.protected_fund_id = fra.protected_fund_ledger_id
          and pfe.event_type = 'release'
          and pfe.metadata->>'release_id' = release_record.id::text
      );
    get diagnostics released_event_count = row_count;
    if released_event_count = 0 then
      raise exception 'No new protected release events were created';
    end if;

    update public.fund_releases
    set status = 'released',
        provider_reference = trim(check_provider_reference),
        provider_status = 'successful',
        provider_confirmed_at = now(),
        released_at = now(),
        next_retry_at = null,
        failure_code = null,
        failure_reason = null,
        updated_at = now()
    where id = release_record.id
    returning * into release_record;

    if release_record.release_type = 'circle_payout' then
      update public.payout_schedule
      set status = 'paid',
          payout_reference = release_record.release_reference,
          updated_at = now()
      where id = release_record.payout_schedule_id;
      insert into public.payouts(
        circle_id, user_id, amount, payout_date, status, method, reference
      ) values (
        release_record.circle_id, release_record.beneficiary_user_id,
        release_record.amount, now(), 'completed', release_record.payment_destination_type,
        release_record.release_reference
      );
    end if;

    insert into public.payout_receipts(
      release_id, receipt_reference, beneficiary_user_id, release_type,
      amount, currency, payment_method, provider, provider_reference
    ) values (
      release_record.id, 'RCT-' || release_record.release_reference,
      release_record.beneficiary_user_id, release_record.release_type,
      release_record.amount, release_record.currency,
      release_record.payment_destination_type, release_record.provider,
      release_record.provider_reference
    ) on conflict (release_id) do nothing;

    insert into public.notifications(
      user_id, circle_id, type, title, body
    ) values (
      release_record.beneficiary_user_id, release_record.circle_id,
      'payout_successful', 'Payout successful',
      'Your GHS ' || to_char(release_record.amount, 'FM999999990.00') ||
        ' payout was completed successfully.'
    );
  else
    raise exception 'Unsupported provider result';
  end if;

  insert into public.audit_logs(
    staff_user_id, action, target_type, target_id, notes, metadata
  ) values (
    null,
    case result_status
      when 'processing' then 'provider_processing'
      when 'failed' then 'provider_failed'
      when 'unknown' then 'provider_status_unknown'
      when 'successful' then 'release_completed'
    end,
    'fund_release', release_record.id,
    'Payout provider lifecycle result recorded.',
    jsonb_build_object(
      'result_status', result_status,
      'amount', release_record.amount,
      'beneficiary_user_id', release_record.beneficiary_user_id,
      'provider_reference', check_provider_reference
    )
  );
  return release_record;
end;
$$;

create or replace function public.get_payout_reconciliation_report()
returns table(issue_type text, record_count bigint, total_amount numeric)
language sql
security definer
stable
set search_path = public
as $$
  with issues as (
    select 'processing_too_long'::text issue_type, fr.amount
    from public.fund_releases fr
    where fr.status = 'provider_processing'
      and fr.last_attempt_at < now() - interval '30 minutes'
    union all
    select 'provider_status_unknown', fr.amount
    from public.fund_releases fr where fr.status = 'provider_status_unknown'
    union all
    select 'failed_attempts_exhausted', fr.amount
    from public.fund_releases fr
    where fr.status in ('provider_failed', 'retry_pending')
      and fr.attempt_count >= fr.max_attempts
    union all
    select 'allocation_amount_mismatch', abs(fr.amount - coalesce(a.total, 0))
    from public.fund_releases fr
    left join (
      select release_id, sum(amount) total
      from public.fund_release_allocations group by release_id
    ) a on a.release_id = fr.id
    where fr.amount <> coalesce(a.total, 0)
    union all
    select 'released_without_provider_confirmation', fr.amount
    from public.fund_releases fr
    where fr.status = 'released'
      and (fr.provider_confirmed_at is null or fr.provider_reference is null)
  )
  select issues.issue_type, count(*), coalesce(sum(issues.amount), 0)
  from issues
  where public.current_user_staff_role() is not null
  group by issues.issue_type;
$$;

alter table public.notifications
  drop constraint if exists notifications_type_check;
alter table public.notifications
  add constraint notifications_type_check check (type in (
    'join_request', 'membership_approved', 'membership_rejected',
    'payment_due_tomorrow', 'payment_due_today', 'payment_successful',
    'payment_failed', 'payment_retry_scheduled', 'payment_overdue',
    'payout_due', 'payout_matured', 'payout_processing',
    'payout_successful', 'payout_failed'
  ));

revoke all on function public.protected_fund_is_test_record(public.protected_fund_ledger)
  from public, anon, authenticated;
revoke all on function public.get_payout_preview(date) from public, anon;
grant execute on function public.get_payout_preview(date) to authenticated;
revoke all on function public.create_fund_release_from_preview(text)
  from public, anon, authenticated;
grant execute on function public.create_fund_release_from_preview(text) to service_role;
revoke all on function public.record_payout_provider_result(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_payout_provider_result(uuid, text, text, text, text)
  to service_role;
revoke all on function public.get_payout_reconciliation_report()
  from public, anon;
grant execute on function public.get_payout_reconciliation_report() to authenticated;

notify pgrst, 'reload schema';
