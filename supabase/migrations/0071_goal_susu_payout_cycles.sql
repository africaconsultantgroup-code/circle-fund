-- Goal Susu recurring payout cycles.
-- Contribution cadence and payout cadence are intentionally independent.
-- Payout execution remains preview-only.

alter table public.goal_susu_details
  add column contribution_frequency text,
  add column payout_frequency text not null default 'one_time'
    check (payout_frequency in (
      'one_time', 'weekly', 'every_14_days', 'twice_monthly', 'monthly'
    )),
  add column overall_start_date date,
  add column overall_end_date date,
  add column twice_monthly_day_one integer
    check (twice_monthly_day_one between 1 and 28),
  add column twice_monthly_day_two integer
    check (twice_monthly_day_two between 1 and 28),
  add column planned_cycle_count integer check (planned_cycle_count > 0),
  add constraint goal_susu_twice_monthly_days_check check (
    payout_frequency <> 'twice_monthly'
    or (
      twice_monthly_day_one is not null
      and twice_monthly_day_two is not null
      and twice_monthly_day_one < twice_monthly_day_two
    )
  ),
  add constraint goal_susu_overall_dates_check check (
    overall_start_date is null or overall_end_date is null
    or overall_end_date > overall_start_date
  );

update public.goal_susu_details gd
set contribution_frequency = c.frequency,
    overall_start_date = c.start_date::date,
    overall_end_date = gd.maturity_date,
    payout_frequency = 'one_time',
    planned_cycle_count = 1
from public.circles c
where c.id = gd.circle_id;

alter table public.goal_susu_details
  alter column contribution_frequency set not null,
  alter column overall_start_date set not null,
  alter column overall_end_date set not null;

create table public.goal_susu_payout_cycles (
  id uuid primary key default gen_random_uuid(),
  goal_susu_id uuid not null
    references public.goal_susu_details(circle_id) on delete restrict,
  cycle_number integer not null check (cycle_number > 0),
  cycle_start_date date not null,
  cycle_end_date date not null,
  payout_date date not null,
  expected_amount numeric(12,2) not null check (expected_amount > 0),
  confirmed_amount numeric(12,2) not null default 0 check (confirmed_amount >= 0),
  protected_amount numeric(12,2) not null default 0 check (protected_amount >= 0),
  outstanding_amount numeric(12,2) generated always as (
    greatest(expected_amount - confirmed_amount, 0)
  ) stored,
  beneficiary_id uuid not null
    references public.goal_susu_beneficiaries(id) on delete restrict,
  status text not null default 'upcoming' check (status in (
    'upcoming', 'collecting', 'fully_funded', 'matured',
    'payout_eligible', 'payout_processing', 'paid',
    'shortfall', 'blocked'
  )),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_susu_id, cycle_number),
  unique (goal_susu_id, payout_date),
  constraint goal_cycle_dates_check check (
    cycle_start_date <= cycle_end_date
    and cycle_end_date <= payout_date
  ),
  constraint goal_cycle_protection_check check (
    protected_amount <= confirmed_amount
  )
);

create table public.goal_susu_cycle_allocations (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null
    references public.goal_susu_payout_cycles(id) on delete restrict,
  contribution_id uuid not null unique
    references public.contributions(id) on delete restrict,
  protected_fund_ledger_id uuid unique
    references public.protected_fund_ledger(id) on delete restrict,
  confirmed_amount numeric(12,2) not null check (confirmed_amount > 0),
  protected_amount numeric(12,2) not null default 0 check (
    protected_amount >= 0 and protected_amount <= confirmed_amount
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goal_cycles_goal_status_date_idx
  on public.goal_susu_payout_cycles(goal_susu_id, status, payout_date);
create index goal_cycle_allocations_cycle_idx
  on public.goal_susu_cycle_allocations(cycle_id);

alter table public.goal_susu_payout_cycles enable row level security;
alter table public.goal_susu_cycle_allocations enable row level security;

create policy "Goal cycles: members view"
  on public.goal_susu_payout_cycles for select using (
    public.user_has_circle_membership(goal_susu_id, auth.uid())
    or public.current_user_staff_role() is not null
  );
create policy "Goal cycle allocations: members view"
  on public.goal_susu_cycle_allocations for select using (
    exists (
      select 1 from public.goal_susu_payout_cycles cycle
      where cycle.id = goal_susu_cycle_allocations.cycle_id
        and (
          public.user_has_circle_membership(cycle.goal_susu_id, auth.uid())
          or public.current_user_staff_role() is not null
        )
    )
  );
revoke insert, update, delete on public.goal_susu_payout_cycles,
  public.goal_susu_cycle_allocations from anon, authenticated;
grant select on public.goal_susu_payout_cycles,
  public.goal_susu_cycle_allocations to authenticated;

create or replace function public.goal_contribution_occurrences(
  range_start date,
  range_end date,
  plan_start date,
  frequency text
)
returns integer
language plpgsql immutable set search_path = public as $$
declare occurrence date := plan_start;
declare total integer := 0;
begin
  if range_end < range_start then return 0; end if;
  while occurrence <= range_end loop
    if occurrence >= range_start then total := total + 1; end if;
    occurrence := case frequency
      when 'weekly' then occurrence + 7
      when 'biweekly' then occurrence + 14
      when 'monthly' then (occurrence + interval '1 month')::date
      else null
    end;
    if occurrence is null then raise exception 'Unsupported contribution frequency'; end if;
  end loop;
  return total;
end;
$$;

create or replace function public.next_twice_monthly_date(
  after_date date,
  day_one integer,
  day_two integer
)
returns date
language plpgsql immutable set search_path = public as $$
declare first_date date;
declare second_date date;
declare next_month date;
begin
  first_date := make_date(extract(year from after_date)::integer,
    extract(month from after_date)::integer, day_one);
  second_date := make_date(extract(year from after_date)::integer,
    extract(month from after_date)::integer, day_two);
  if after_date <= first_date then return first_date; end if;
  if after_date <= second_date then return second_date; end if;
  next_month := (date_trunc('month', after_date) + interval '1 month')::date;
  return make_date(extract(year from next_month)::integer,
    extract(month from next_month)::integer, day_one);
end;
$$;

create or replace function public.generate_goal_susu_payout_cycles(
  check_circle_id uuid
)
returns integer
language plpgsql security definer set search_path = public as $$
declare goal public.goal_susu_details;
declare circle_record public.circles;
declare beneficiary public.goal_susu_beneficiaries;
declare cycle_start date;
declare cycle_end date;
declare cycle_payout date;
declare cycle_number integer := 1;
declare occurrences integer;
declare cycle_expected numeric;
declare inserted_count integer := 0;
begin
  select * into goal from public.goal_susu_details
  where circle_id = check_circle_id for update;
  select * into circle_record from public.circles where id = check_circle_id;
  select * into beneficiary from public.goal_susu_beneficiaries
  where circle_id = check_circle_id;
  if goal.circle_id is null or circle_record.circle_type <> 'goal' then
    raise exception 'Goal Susu not found';
  end if;
  if beneficiary.id is null then raise exception 'Goal beneficiary is required'; end if;
  if exists (
    select 1 from public.goal_susu_payout_cycles where goal_susu_id = check_circle_id
  ) then
    return 0;
  end if;

  cycle_start := goal.overall_start_date;
  while cycle_start <= goal.overall_end_date loop
    cycle_payout := case goal.payout_frequency
      when 'one_time' then goal.overall_end_date
      when 'weekly' then least(cycle_start + 6, goal.overall_end_date)
      when 'every_14_days' then least(cycle_start + 13, goal.overall_end_date)
      when 'monthly' then least(
        (cycle_start + interval '1 month')::date - 1,
        goal.overall_end_date
      )
      when 'twice_monthly' then least(
        public.next_twice_monthly_date(
          cycle_start, goal.twice_monthly_day_one, goal.twice_monthly_day_two
        ),
        goal.overall_end_date
      )
      else null
    end;
    if cycle_payout is null then raise exception 'Unsupported payout frequency'; end if;
    cycle_end := cycle_payout;
    occurrences := public.goal_contribution_occurrences(
      cycle_start, cycle_end, goal.overall_start_date,
      goal.contribution_frequency
    );
    cycle_expected := case
      when goal.payout_frequency = 'one_time' then goal.target_amount
      else circle_record.contribution_amount
        * circle_record.max_members * greatest(occurrences, 1)
    end;

    insert into public.goal_susu_payout_cycles(
      goal_susu_id, cycle_number, cycle_start_date, cycle_end_date,
      payout_date, expected_amount, beneficiary_id,
      status
    ) values (
      check_circle_id, cycle_number, cycle_start, cycle_end,
      cycle_payout, cycle_expected, beneficiary.id,
      case when cycle_start <= current_date then 'collecting' else 'upcoming' end
    );
    inserted_count := inserted_count + 1;
    exit when goal.payout_frequency = 'one_time'
      or cycle_payout >= goal.overall_end_date;
    cycle_start := cycle_payout + 1;
    cycle_number := cycle_number + 1;
  end loop;

  update public.goal_susu_details
  set planned_cycle_count = inserted_count,
      target_amount = case
        when payout_frequency = 'one_time' then target_amount
        else (
          select sum(expected_amount)
          from public.goal_susu_payout_cycles
          where goal_susu_id = check_circle_id
        )
      end,
      updated_at = now()
  where circle_id = check_circle_id;
  update public.circles
  set goal_amount = (
    select target_amount from public.goal_susu_details
    where circle_id = check_circle_id
  ), updated_at = now()
  where id = check_circle_id;
  return inserted_count;
end;
$$;

-- Preserve any pre-0071 one-time Goal Susu as a single cycle.
select public.generate_goal_susu_payout_cycles(circle_id)
from public.goal_susu_details
where not exists (
  select 1 from public.goal_susu_payout_cycles cycle
  where cycle.goal_susu_id = goal_susu_details.circle_id
);

create or replace function public.create_goal_susu_with_cycles(
  goal_name text,
  goal_description text,
  target_amount numeric,
  contribution_amount numeric,
  contribution_frequency text,
  payout_frequency text,
  overall_start_date date,
  overall_end_date date,
  maximum_members integer,
  currency text,
  invite_value text,
  beneficiary_type text,
  beneficiary_user_id uuid,
  beneficiary_name text,
  destination_reference text,
  mobile_money_network text,
  relationship_or_purpose text default null,
  twice_monthly_day_one integer default null,
  twice_monthly_day_two integer default null
)
returns public.circles
language plpgsql security definer set search_path = public as $$
declare created_circle public.circles;
declare created_membership public.circle_members;
declare created_beneficiary public.goal_susu_beneficiaries;
begin
  if auth.uid() is null or not public.user_passes_circle_onboarding(auth.uid()) then
    raise exception 'Circle onboarding requirements are not complete';
  end if;
  if trim(goal_name) = '' or target_amount <= 0 or contribution_amount <= 0 then
    raise exception 'Goal name, target and contribution must be valid';
  end if;
  if contribution_frequency not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Unsupported contribution frequency';
  end if;
  if overall_end_date <= overall_start_date then
    raise exception 'Overall end date must be after the start date';
  end if;
  if maximum_members < 2 or maximum_members > 15 then
    raise exception 'Maximum members must be between 2 and 15';
  end if;
  if beneficiary_type not in ('sikacircle_user', 'external') then
    raise exception 'Invalid beneficiary type';
  end if;
  if beneficiary_type = 'sikacircle_user' and beneficiary_user_id is null then
    raise exception 'Select a SikaCircle beneficiary';
  end if;
  if beneficiary_type = 'external' and beneficiary_user_id is not null then
    raise exception 'External beneficiary cannot use a SikaCircle user identifier';
  end if;
  if payout_frequency not in (
    'one_time', 'weekly', 'every_14_days', 'twice_monthly', 'monthly'
  ) then raise exception 'Unsupported Goal Susu payout frequency'; end if;
  if payout_frequency = 'twice_monthly' and (
    twice_monthly_day_one is null or twice_monthly_day_two is null
    or twice_monthly_day_one >= twice_monthly_day_two
  ) then raise exception 'Choose two distinct twice-monthly payout dates'; end if;

  insert into public.circles(
    owner_id, name, description, goal_amount, contribution_amount,
    base_currency, frequency, max_members, invite_token, invite_code,
    start_date, end_date, status, circle_type
  ) values (
    auth.uid(), trim(goal_name), nullif(trim(goal_description), ''),
    target_amount, contribution_amount, upper(currency),
    contribution_frequency, maximum_members, upper(invite_value),
    upper(invite_value), overall_start_date, overall_end_date,
    'active', 'goal'
  ) returning * into created_circle;

  insert into public.circle_members(
    circle_id, user_id, role, status, invited_by, approved_by, approved_at
  ) values (
    created_circle.id, auth.uid(), 'creator', 'approved',
    auth.uid(), auth.uid(), now()
  ) returning * into created_membership;

  insert into public.goal_susu_details(
    circle_id, target_amount, maturity_date, lifecycle_status,
    contribution_frequency, payout_frequency, overall_start_date,
    overall_end_date, twice_monthly_day_one, twice_monthly_day_two
  ) values (
    created_circle.id, target_amount, overall_end_date, 'draft',
    contribution_frequency, payout_frequency, overall_start_date,
    overall_end_date, twice_monthly_day_one, twice_monthly_day_two
  );

  insert into public.goal_susu_beneficiaries(
    circle_id, beneficiary_type, beneficiary_user_id, beneficiary_name,
    destination_reference, mobile_money_network, relationship_or_purpose
  ) values (
    created_circle.id, beneficiary_type, beneficiary_user_id,
    trim(beneficiary_name), trim(destination_reference),
    nullif(trim(mobile_money_network), ''),
    nullif(trim(relationship_or_purpose), '')
  ) returning * into created_beneficiary;

  perform public.generate_goal_susu_payout_cycles(created_circle.id);

  insert into public.goal_susu_member_acceptances(
    circle_id, membership_id, user_id, agreement_snapshot
  ) values (
    created_circle.id, created_membership.id, auth.uid(),
    jsonb_build_object(
      'circle_name', created_circle.name,
      'goal', created_circle.description,
      'target_amount', (
        select target_amount from public.goal_susu_details
        where circle_id = created_circle.id
      ),
      'contribution_amount', contribution_amount,
      'contribution_frequency', contribution_frequency,
      'payout_frequency', payout_frequency,
      'overall_start_date', overall_start_date,
      'overall_end_date', overall_end_date,
      'twice_monthly_days', case when payout_frequency = 'twice_monthly'
        then jsonb_build_array(twice_monthly_day_one, twice_monthly_day_two)
        else null end,
      'beneficiary_name', created_beneficiary.beneficiary_name,
      'beneficiary_type', created_beneficiary.beneficiary_type,
      'masked_destination',
        public.mask_goal_destination(created_beneficiary.destination_reference),
      'protection_status', 'Protected in SikaCircle'
    )
  );
  insert into public.audit_logs(
    staff_user_id, action, target_type, target_id, notes, metadata
  ) values (
    auth.uid(), 'goal_susu_created', 'circle', created_circle.id,
    'Goal Susu created with independently funded payout cycles.',
    jsonb_build_object(
      'payout_frequency', payout_frequency,
      'contribution_frequency', contribution_frequency,
      'overall_end_date', overall_end_date,
      'beneficiary_id', created_beneficiary.id
    )
  );
  select * into created_circle from public.circles where id = created_circle.id;
  return created_circle;
end;
$$;

create or replace function public.allocate_confirmed_goal_contribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_cycle public.goal_susu_payout_cycles;
declare paid_amount numeric;
begin
  if new.status not in ('paid', 'processed')
    or (tg_op = 'UPDATE' and old.status in ('paid', 'processed')) then
    return new;
  end if;
  if not exists (
    select 1 from public.circles
    where id = new.circle_id and circle_type = 'goal'
  ) then return new; end if;

  select * into target_cycle
  from public.goal_susu_payout_cycles cycle
  where cycle.goal_susu_id = new.circle_id
    and coalesce(new.due_date::date, new.contribution_date::date, current_date)
      between cycle.cycle_start_date and cycle.cycle_end_date
  order by cycle.cycle_number limit 1 for update;
  if target_cycle.id is null then
    raise exception 'Confirmed Goal contribution does not match a payout cycle';
  end if;
  paid_amount := coalesce(new.amount, new.amount_due);
  insert into public.goal_susu_cycle_allocations(
    cycle_id, contribution_id, confirmed_amount
  ) values (target_cycle.id, new.id, paid_amount)
  on conflict (contribution_id) do nothing;
  update public.goal_susu_payout_cycles cycle
  set confirmed_amount = totals.confirmed,
      status = case
        when totals.confirmed >= cycle.expected_amount then 'fully_funded'
        when cycle.cycle_start_date <= current_date then 'collecting'
        else 'upcoming'
      end,
      updated_at = now()
  from (
    select cycle_id, sum(confirmed_amount) confirmed
    from public.goal_susu_cycle_allocations
    where cycle_id = target_cycle.id group by cycle_id
  ) totals
  where cycle.id = totals.cycle_id;
  return new;
end;
$$;

create trigger allocate_confirmed_goal_contribution
after insert or update of status on public.contributions
for each row execute function public.allocate_confirmed_goal_contribution();

create or replace function public.allocate_goal_protected_fund_to_cycle()
returns trigger language plpgsql security definer set search_path = public as $$
declare contribution_uuid uuid;
declare allocation_record public.goal_susu_cycle_allocations;
begin
  if new.goal_beneficiary_id is null then return new; end if;
  begin
    contribution_uuid := nullif(new.metadata->>'contribution_id', '')::uuid;
  exception when invalid_text_representation then
    contribution_uuid := null;
  end;
  if contribution_uuid is null then
    raise exception 'Goal protected fund is missing its contribution identifier';
  end if;
  select * into allocation_record
  from public.goal_susu_cycle_allocations
  where contribution_id = contribution_uuid for update;
  if allocation_record.id is null then
    raise exception 'Goal protected fund has no confirmed cycle allocation';
  end if;
  update public.goal_susu_cycle_allocations
  set protected_fund_ledger_id = new.id,
      protected_amount = new.amount, updated_at = now()
  where id = allocation_record.id
    and protected_fund_ledger_id is null;
  update public.goal_susu_payout_cycles cycle
  set protected_amount = totals.protected,
      status = case
        when cycle.payout_date <= current_date
          and totals.protected >= cycle.expected_amount then 'payout_eligible'
        when totals.protected >= cycle.expected_amount then 'fully_funded'
        when cycle.payout_date <= current_date then 'shortfall'
        else 'collecting'
      end,
      updated_at = now()
  from (
    select cycle_id, sum(protected_amount) protected
    from public.goal_susu_cycle_allocations
    where cycle_id = allocation_record.cycle_id group by cycle_id
  ) totals
  where cycle.id = totals.cycle_id;
  return new;
end;
$$;

create trigger allocate_goal_protected_fund_to_cycle
after insert on public.protected_fund_ledger
for each row execute function public.allocate_goal_protected_fund_to_cycle();

alter table public.protected_fund_ledger
  add column goal_susu_cycle_id uuid
    references public.goal_susu_payout_cycles(id) on delete restrict;
alter table public.fund_releases
  add column goal_susu_cycle_id uuid
    references public.goal_susu_payout_cycles(id) on delete restrict;
drop index public.fund_releases_goal_success_key;
create unique index fund_releases_goal_cycle_success_key
  on public.fund_releases(goal_susu_cycle_id)
  where release_type = 'goal_susu_payout' and status <> 'cancelled';
alter table public.fund_releases
  drop constraint fund_releases_target_check,
  add constraint fund_releases_target_check check (
    (release_type = 'circle_payout' and circle_id is not null
      and piggy_id is null and payout_schedule_id is not null
      and goal_beneficiary_id is null and goal_susu_cycle_id is null
      and beneficiary_user_id is not null)
    or
    (release_type = 'piggy_maturity' and piggy_id is not null
      and circle_id is null and payout_schedule_id is null
      and goal_beneficiary_id is null and goal_susu_cycle_id is null
      and beneficiary_user_id is not null)
    or
    (release_type = 'goal_susu_payout' and circle_id is not null
      and piggy_id is null and payout_schedule_id is null
      and goal_beneficiary_id is not null and goal_susu_cycle_id is not null)
  );

create or replace function public.set_goal_fund_cycle_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare contribution_uuid uuid;
begin
  if new.goal_beneficiary_id is null then return new; end if;
  begin
    contribution_uuid := nullif(new.metadata->>'contribution_id', '')::uuid;
  exception when invalid_text_representation then contribution_uuid := null;
  end;
  select allocation.cycle_id into new.goal_susu_cycle_id
  from public.goal_susu_cycle_allocations allocation
  where allocation.contribution_id = contribution_uuid;
  if new.goal_susu_cycle_id is null then
    raise exception 'Goal protected fund cannot be bound to a payout cycle';
  end if;
  new.maturity_date := (
    select payout_date from public.goal_susu_payout_cycles
    where id = new.goal_susu_cycle_id
  );
  return new;
end;
$$;
create trigger set_goal_fund_cycle
before insert on public.protected_fund_ledger
for each row execute function public.set_goal_fund_cycle_before_insert();

drop function public.get_goal_susu_payout_preview(date);
create function public.get_goal_susu_payout_preview(as_of_date date default current_date)
returns table(
  candidate_key text, release_type text, circle_id uuid,
  goal_susu_cycle_id uuid, beneficiary_user_id uuid, beneficiary_name text,
  amount numeric, currency text, maturity_date date,
  protected_funds_available numeric, frozen_amount numeric,
  payment_destination_type text, payment_destination_summary text,
  eligibility text, blocking_reason text, is_test_record boolean
)
language sql security definer stable set search_path = public as $$
  with candidates as (
    select
      'goal_cycle:' || cycle.id::text candidate_key,
      cycle.goal_susu_id circle_id, cycle.id goal_susu_cycle_id,
      gb.beneficiary_user_id, gb.beneficiary_name,
      cycle.expected_amount amount, c.base_currency::text currency,
      cycle.payout_date maturity_date, cycle.protected_amount,
      coalesce(sum(pf.amount) filter (where pf.status = 'frozen'), 0) frozen_amount,
      bool_or(coalesce(public.protected_fund_is_test_record(pf), false)) test_record,
      gb.verification_status,
      count(distinct acceptance.id) accepted_members,
      count(distinct member.id) approved_members,
      exists (
        select 1 from public.protection_reconciliation_queue q
        where q.status in ('open', 'investigating')
          and (q.details->>'circle_id' = c.id::text
            or q.protected_fund_id in (
              select cycle_pf.id from public.protected_fund_ledger cycle_pf
              where cycle_pf.goal_susu_cycle_id = cycle.id
            ))
      ) reconciliation_block,
      exists (
        select 1 from public.fund_releases release
        where release.goal_susu_cycle_id = cycle.id and release.status <> 'cancelled'
      ) existing_release
    from public.goal_susu_payout_cycles cycle
    join public.circles c on c.id = cycle.goal_susu_id
    join public.goal_susu_beneficiaries gb on gb.id = cycle.beneficiary_id
    left join public.protected_fund_ledger pf
      on pf.goal_susu_cycle_id = cycle.id
    left join public.circle_members member
      on member.circle_id = c.id and member.status = 'approved'
    left join public.goal_susu_member_acceptances acceptance
      on acceptance.circle_id = c.id and acceptance.membership_id = member.id
    group by cycle.id, cycle.goal_susu_id, cycle.expected_amount, c.id,
      cycle.payout_date, cycle.protected_amount, c.base_currency,
      gb.beneficiary_user_id, gb.beneficiary_name, gb.verification_status
  ),
  classified as (
    select *,
      case
        when coalesce(test_record, false) then 'BLOCKED_TEST_RECORD'
        when maturity_date > as_of_date then 'BLOCKED_NOT_MATURED'
        when verification_status <> 'verified' then 'BLOCKED_NO_DESTINATION'
        when accepted_members < approved_members then 'BLOCKED_TERMS_NOT_ACCEPTED'
        when reconciliation_block then 'BLOCKED_RECONCILIATION'
        when frozen_amount > 0 then 'BLOCKED_FROZEN'
        when existing_release then 'BLOCKED_ALREADY_RELEASED'
        when protected_amount < amount then 'BLOCKED_INSUFFICIENT_FUNDS'
        else 'READY'
      end eligibility
    from candidates
  )
  select cl.candidate_key, 'goal_susu_payout', cl.circle_id,
    cl.goal_susu_cycle_id, cl.beneficiary_user_id, cl.beneficiary_name,
    cl.amount, cl.currency, cl.maturity_date, cl.protected_amount,
    cl.frozen_amount, 'mobile_money',
    public.mask_goal_destination(gb.destination_reference), cl.eligibility,
    case cl.eligibility
      when 'READY' then null
      when 'BLOCKED_TEST_RECORD' then 'Test-funded Goal Susu cycle cannot execute.'
      when 'BLOCKED_NOT_MATURED' then 'This payout cycle has not matured.'
      when 'BLOCKED_NO_DESTINATION' then 'Beneficiary destination is not verified.'
      when 'BLOCKED_TERMS_NOT_ACCEPTED' then 'All approved members must accept the terms.'
      when 'BLOCKED_RECONCILIATION' then 'An unresolved protection issue blocks this cycle.'
      when 'BLOCKED_FROZEN' then 'This cycle contains frozen protected funds.'
      when 'BLOCKED_ALREADY_RELEASED' then 'This cycle already has a payout release.'
      when 'BLOCKED_INSUFFICIENT_FUNDS' then 'This cycle has insufficient protected funds.'
      else 'Eligibility could not be proven.'
    end,
    coalesce(cl.test_record, false)
  from classified cl
  join public.goal_susu_beneficiaries gb on gb.circle_id = cl.circle_id
  where auth.role() = 'service_role'
    or public.current_user_staff_role() is not null
    or public.user_has_circle_membership(cl.circle_id, auth.uid())
$$;

drop function public.get_goal_susu_join_preview(text);
create function public.get_goal_susu_join_preview(invite_value text)
returns table(
  circle_id uuid, circle_name text, goal_description text, target_amount numeric,
  contribution_amount numeric, contribution_frequency text,
  payout_frequency text, start_date timestamptz, end_date date,
  max_members integer, beneficiary_name text, beneficiary_type text,
  masked_destination text, verification_status text,
  twice_monthly_day_one integer, twice_monthly_day_two integer
)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.description, gd.target_amount,
    c.contribution_amount, gd.contribution_frequency,
    gd.payout_frequency, c.start_date, gd.overall_end_date,
    c.max_members, gb.beneficiary_name, gb.beneficiary_type,
    public.mask_goal_destination(gb.destination_reference),
    gb.verification_status, gd.twice_monthly_day_one,
    gd.twice_monthly_day_two
  from public.circles c
  join public.goal_susu_details gd on gd.circle_id = c.id
  join public.goal_susu_beneficiaries gb on gb.circle_id = c.id
  where c.circle_type = 'goal' and c.status = 'active'
    and (c.invite_token = upper(trim(invite_value))
      or c.invite_code = upper(trim(invite_value)))
  limit 1
$$;

create or replace function public.get_goal_susu_cycles(check_circle_id uuid)
returns table(
  cycle_id uuid, cycle_number integer, cycle_start_date date,
  cycle_end_date date, payout_date date, expected_amount numeric,
  confirmed_amount numeric, protected_amount numeric,
  outstanding_amount numeric, status text
)
language sql security definer stable set search_path = public as $$
  select cycle.id, cycle.cycle_number, cycle.cycle_start_date,
    cycle.cycle_end_date, cycle.payout_date, cycle.expected_amount,
    cycle.confirmed_amount, cycle.protected_amount,
    cycle.outstanding_amount, cycle.status
  from public.goal_susu_payout_cycles cycle
  where cycle.goal_susu_id = check_circle_id
    and (
      public.user_has_circle_membership(check_circle_id, auth.uid())
      or public.current_user_staff_role() is not null
    )
  order by cycle.cycle_number
$$;

revoke all on function public.create_goal_susu_with_cycles(
  text,text,numeric,numeric,text,text,date,date,integer,text,text,text,uuid,
  text,text,text,text,integer,integer
) from public, anon;
grant execute on function public.create_goal_susu_with_cycles(
  text,text,numeric,numeric,text,text,date,date,integer,text,text,text,uuid,
  text,text,text,text,integer,integer
) to authenticated;
revoke execute on function public.create_goal_susu(
  text,text,numeric,numeric,text,date,date,integer,text,text,text,uuid,
  text,text,text,text
) from authenticated;
revoke all on function public.generate_goal_susu_payout_cycles(uuid)
  from public, anon, authenticated;
revoke all on function public.get_goal_susu_payout_preview(date)
  from public, anon;
grant execute on function public.get_goal_susu_payout_preview(date)
  to authenticated;
revoke all on function public.get_goal_susu_join_preview(text) from public, anon;
grant execute on function public.get_goal_susu_join_preview(text) to authenticated;
revoke all on function public.get_goal_susu_cycles(uuid) from public, anon;
grant execute on function public.get_goal_susu_cycles(uuid) to authenticated;
revoke all on function public.goal_contribution_occurrences(date,date,date,text)
  from public, anon, authenticated;
revoke all on function public.next_twice_monthly_date(date,integer,integer)
  from public, anon, authenticated;

notify pgrst, 'reload schema';
