-- Goal Susu foundation.
-- Existing circles remain rotational. No payout execution is enabled here.

alter table public.circles
  add column if not exists circle_type text not null default 'rotational',
  add constraint circles_circle_type_check
    check (circle_type in ('rotational', 'goal'));

create table public.goal_susu_details (
  circle_id uuid primary key references public.circles(id) on delete restrict,
  target_amount numeric(12,2) not null check (target_amount > 0),
  maturity_date date not null,
  lifecycle_status text not null default 'draft' check (lifecycle_status in (
    'draft', 'active', 'matured', 'payout_eligible', 'payout_processing',
    'paid', 'blocked', 'archived'
  )),
  terms_locked_at timestamptz,
  target_reached_at timestamptz,
  matured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goal_susu_beneficiaries (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null unique references public.circles(id) on delete restrict,
  beneficiary_type text not null check (beneficiary_type in ('sikacircle_user', 'external')),
  beneficiary_user_id uuid references auth.users(id) on delete restrict,
  beneficiary_name text not null check (length(trim(beneficiary_name)) between 2 and 120),
  destination_type text not null default 'mobile_money'
    check (destination_type in ('mobile_money')),
  destination_reference text not null,
  mobile_money_network text,
  relationship_or_purpose text,
  verification_status text not null default 'pending_verification' check (
    verification_status in (
      'pending_verification', 'verified', 'verification_failed',
      'reverification_required'
    )
  ),
  verification_provider text,
  verification_reference text,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_beneficiary_type_target_check check (
    (beneficiary_type = 'sikacircle_user' and beneficiary_user_id is not null)
    or (beneficiary_type = 'external' and beneficiary_user_id is null)
  )
);

create table public.goal_susu_member_acceptances (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  membership_id uuid not null references public.circle_members(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  terms_version integer not null default 1 check (terms_version > 0),
  accepted_at timestamptz not null default now(),
  agreement_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique (circle_id, membership_id, terms_version)
);

create table public.goal_beneficiary_change_requests (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete restrict,
  old_beneficiary_id uuid not null references public.goal_susu_beneficiaries(id) on delete restrict,
  proposed_beneficiary_type text not null check (
    proposed_beneficiary_type in ('sikacircle_user', 'external')
  ),
  proposed_beneficiary_user_id uuid references auth.users(id) on delete restrict,
  proposed_beneficiary_name text not null,
  proposed_destination_type text not null default 'mobile_money'
    check (proposed_destination_type = 'mobile_money'),
  proposed_destination_reference text not null,
  proposed_mobile_money_network text,
  proposed_verification_status text not null default 'pending_verification' check (
    proposed_verification_status in (
      'pending_verification', 'verified', 'verification_failed',
      'reverification_required'
    )
  ),
  reason text not null check (length(trim(reason)) >= 5),
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'cancelled', 'applied')
  ),
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_change_type_target_check check (
    (proposed_beneficiary_type = 'sikacircle_user' and proposed_beneficiary_user_id is not null)
    or (proposed_beneficiary_type = 'external' and proposed_beneficiary_user_id is null)
  )
);

create table public.goal_beneficiary_change_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.goal_beneficiary_change_requests(id) on delete restrict,
  membership_id uuid not null references public.circle_members(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('approved', 'rejected')),
  decided_at timestamptz not null default now(),
  unique (request_id, membership_id)
);

create index goal_susu_details_status_maturity_idx
  on public.goal_susu_details(lifecycle_status, maturity_date);
create index goal_susu_acceptances_circle_user_idx
  on public.goal_susu_member_acceptances(circle_id, user_id);
create index goal_beneficiary_changes_circle_status_idx
  on public.goal_beneficiary_change_requests(circle_id, status);

alter table public.protected_fund_ledger
  add column if not exists goal_beneficiary_id uuid
    references public.goal_susu_beneficiaries(id) on delete restrict;
create index protected_fund_goal_beneficiary_idx
  on public.protected_fund_ledger(goal_beneficiary_id)
  where goal_beneficiary_id is not null;

alter table public.goal_susu_details enable row level security;
alter table public.goal_susu_beneficiaries enable row level security;
alter table public.goal_susu_member_acceptances enable row level security;
alter table public.goal_beneficiary_change_requests enable row level security;
alter table public.goal_beneficiary_change_approvals enable row level security;

create policy "Goal details: members view"
  on public.goal_susu_details for select using (
    public.user_has_circle_membership(circle_id, auth.uid())
    or public.current_user_staff_role() is not null
  );
create policy "Goal beneficiaries: members view"
  on public.goal_susu_beneficiaries for select using (
    public.user_has_circle_membership(circle_id, auth.uid())
    or public.current_user_staff_role() is not null
  );
create policy "Goal acceptances: members view"
  on public.goal_susu_member_acceptances for select using (
    public.user_has_circle_membership(circle_id, auth.uid())
    or public.current_user_staff_role() is not null
  );
create policy "Goal changes: members view"
  on public.goal_beneficiary_change_requests for select using (
    public.user_has_circle_membership(circle_id, auth.uid())
    or public.current_user_staff_role() is not null
  );
create policy "Goal change approvals: members view"
  on public.goal_beneficiary_change_approvals for select using (
    exists (
      select 1 from public.goal_beneficiary_change_requests r
      where r.id = goal_beneficiary_change_approvals.request_id
        and (
          public.user_has_circle_membership(r.circle_id, auth.uid())
          or public.current_user_staff_role() is not null
        )
    )
  );

revoke insert, update, delete on public.goal_susu_details,
  public.goal_susu_beneficiaries, public.goal_susu_member_acceptances,
  public.goal_beneficiary_change_requests,
  public.goal_beneficiary_change_approvals
  from anon, authenticated;
grant select on public.goal_susu_details, public.goal_susu_beneficiaries,
  public.goal_susu_member_acceptances, public.goal_beneficiary_change_requests,
  public.goal_beneficiary_change_approvals to authenticated;

create or replace function public.mask_goal_destination(value text)
returns text language sql immutable as $$
  select case
    when value is null or length(regexp_replace(value, '\D', '', 'g')) < 4 then 'Not set'
    else 'Mobile Money •••• ' || right(regexp_replace(value, '\D', '', 'g'), 4)
  end
$$;

create or replace function public.create_goal_susu(
  goal_name text,
  goal_description text,
  target_amount numeric,
  contribution_amount numeric,
  contribution_frequency text,
  first_contribution_date date,
  maturity_date date,
  maximum_members integer,
  currency text,
  invite_value text,
  beneficiary_type text,
  beneficiary_user_id uuid,
  beneficiary_name text,
  destination_reference text,
  mobile_money_network text,
  relationship_or_purpose text default null
)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  created_circle public.circles;
  created_membership public.circle_members;
  beneficiary public.goal_susu_beneficiaries;
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
  if maturity_date <= first_contribution_date then
    raise exception 'Maturity date must be after the start date';
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

  insert into public.circles(
    owner_id, name, description, goal_amount, contribution_amount,
    base_currency, frequency, max_members, invite_token, invite_code,
    start_date, end_date, status, circle_type
  ) values (
    auth.uid(), trim(goal_name), nullif(trim(goal_description), ''),
    target_amount, contribution_amount, upper(currency),
    contribution_frequency, maximum_members, upper(invite_value),
    upper(invite_value), first_contribution_date, maturity_date,
    'active', 'goal'
  ) returning * into created_circle;

  insert into public.circle_members(
    circle_id, user_id, role, status, invited_by, approved_by, approved_at
  ) values (
    created_circle.id, auth.uid(), 'creator', 'approved',
    auth.uid(), auth.uid(), now()
  ) returning * into created_membership;

  insert into public.goal_susu_details(
    circle_id, target_amount, maturity_date, lifecycle_status
  ) values (
    created_circle.id, target_amount, maturity_date, 'draft'
  );

  insert into public.goal_susu_beneficiaries(
    circle_id, beneficiary_type, beneficiary_user_id, beneficiary_name,
    destination_reference, mobile_money_network, relationship_or_purpose
  ) values (
    created_circle.id, beneficiary_type, beneficiary_user_id,
    trim(beneficiary_name), trim(destination_reference),
    nullif(trim(mobile_money_network), ''),
    nullif(trim(relationship_or_purpose), '')
  ) returning * into beneficiary;

  insert into public.goal_susu_member_acceptances(
    circle_id, membership_id, user_id, agreement_snapshot
  ) values (
    created_circle.id, created_membership.id, auth.uid(),
    jsonb_build_object(
      'circle_name', created_circle.name,
      'goal', created_circle.description,
      'target_amount', target_amount,
      'contribution_amount', contribution_amount,
      'frequency', contribution_frequency,
      'start_date', first_contribution_date,
      'maturity_date', maturity_date,
      'beneficiary_name', beneficiary.beneficiary_name,
      'beneficiary_type', beneficiary.beneficiary_type,
      'masked_destination', public.mask_goal_destination(beneficiary.destination_reference),
      'protection_status', 'Protected in SikaCircle'
    )
  );

  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(), 'goal_susu_created', 'circle', created_circle.id,
    'Goal Susu created with a pending-verification beneficiary.',
    jsonb_build_object(
      'circle_type', 'goal', 'target_amount', target_amount,
      'maturity_date', maturity_date, 'beneficiary_id', beneficiary.id
    )
  );
  return created_circle;
end;
$$;

create or replace function public.get_goal_susu_join_preview(invite_value text)
returns table(
  circle_id uuid, circle_name text, goal_description text, target_amount numeric,
  contribution_amount numeric, frequency text, start_date timestamptz,
  maturity_date date, max_members integer, beneficiary_name text,
  beneficiary_type text, masked_destination text, verification_status text
)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.description, gd.target_amount,
    c.contribution_amount, c.frequency, c.start_date, gd.maturity_date,
    c.max_members, gb.beneficiary_name, gb.beneficiary_type,
    public.mask_goal_destination(gb.destination_reference),
    gb.verification_status
  from public.circles c
  join public.goal_susu_details gd on gd.circle_id = c.id
  join public.goal_susu_beneficiaries gb on gb.circle_id = c.id
  where c.circle_type = 'goal' and c.status = 'active'
    and (c.invite_token = upper(trim(invite_value))
      or c.invite_code = upper(trim(invite_value)))
  limit 1
$$;

create or replace function public.accept_goal_susu_terms(check_circle_id uuid)
returns public.goal_susu_member_acceptances
language plpgsql security definer set search_path = public as $$
declare
  member public.circle_members;
  circle_record public.circles;
  goal public.goal_susu_details;
  beneficiary public.goal_susu_beneficiaries;
  acceptance public.goal_susu_member_acceptances;
begin
  select * into member from public.circle_members
  where circle_id = check_circle_id and user_id = auth.uid()
    and status in ('pending', 'pending_capacity_review', 'approved');
  if member.id is null then raise exception 'Join the Goal Susu before accepting its terms'; end if;
  select * into circle_record from public.circles where id = check_circle_id and circle_type = 'goal';
  select * into goal from public.goal_susu_details where circle_id = check_circle_id;
  select * into beneficiary from public.goal_susu_beneficiaries where circle_id = check_circle_id;
  if beneficiary.id is null then raise exception 'Goal beneficiary is missing'; end if;

  insert into public.goal_susu_member_acceptances(
    circle_id, membership_id, user_id, agreement_snapshot
  ) values (
    check_circle_id, member.id, auth.uid(),
    jsonb_build_object(
      'circle_name', circle_record.name, 'goal', circle_record.description,
      'target_amount', goal.target_amount,
      'contribution_amount', circle_record.contribution_amount,
      'frequency', circle_record.frequency,
      'start_date', circle_record.start_date,
      'maturity_date', goal.maturity_date,
      'beneficiary_name', beneficiary.beneficiary_name,
      'beneficiary_type', beneficiary.beneficiary_type,
      'masked_destination', public.mask_goal_destination(beneficiary.destination_reference),
      'protection_status', 'Protected in SikaCircle'
    )
  )
  on conflict (circle_id, membership_id, terms_version)
  do update set accepted_at = excluded.accepted_at
  returning * into acceptance;

  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(), 'goal_terms_accepted', 'circle', check_circle_id,
    'Member accepted Goal Susu terms.',
    jsonb_build_object('membership_id', member.id, 'terms_version', acceptance.terms_version)
  );
  return acceptance;
end;
$$;

create or replace function public.goal_susu_progress(check_circle_id uuid)
returns table(
  target_amount numeric, collected_amount numeric, protected_amount numeric,
  pending_amount numeric, outstanding_amount numeric, progress_percent numeric,
  maturity_date date, days_remaining integer, members_paid bigint,
  members_outstanding bigint, lifecycle_status text, payout_status text,
  beneficiary_name text, masked_destination text, verification_status text
)
language sql security definer stable set search_path = public as $$
  with goal as (
    select gd.*, c.circle_type
    from public.goal_susu_details gd
    join public.circles c on c.id = gd.circle_id
    where gd.circle_id = check_circle_id and c.circle_type = 'goal'
  ),
  paid as (
    select coalesce(sum(c.amount), 0) amount
    from public.contributions c
    where c.circle_id = check_circle_id
      and c.status in ('paid', 'processed')
  ),
  pending as (
    select coalesce(sum(c.amount_due), 0) amount
    from public.contributions c
    where c.circle_id = check_circle_id and c.status = 'pending'
  ),
  protected as (
    select coalesce(sum(pf.amount), 0) amount
    from public.protected_fund_ledger pf
    where pf.circle_id = check_circle_id
      and pf.status in ('protected', 'matured', 'release_pending', 'released')
  ),
  standing as (
    select cm.user_id,
      coalesce(sum(c.amount) filter (where c.status in ('paid', 'processed')), 0) paid
    from public.circle_members cm
    left join public.contributions c on c.member_id = cm.id
    where cm.circle_id = check_circle_id and cm.status = 'approved'
    group by cm.user_id
  )
  select g.target_amount, p.amount, pr.amount, pn.amount,
    greatest(g.target_amount - p.amount, 0),
    least(round((p.amount / nullif(g.target_amount, 0)) * 100, 2), 100),
    g.maturity_date, greatest(g.maturity_date - current_date, 0),
    count(*) filter (where s.paid > 0),
    count(*) filter (where s.paid <= 0),
    g.lifecycle_status,
    case
      when g.maturity_date > current_date then 'Not Yet Matured'
      when pr.amount < g.target_amount then 'Insufficient Protected Funds'
      else 'Payout Preview Eligible'
    end
    , gb.beneficiary_name, public.mask_goal_destination(gb.destination_reference),
    gb.verification_status
  from goal g
  join public.goal_susu_beneficiaries gb on gb.circle_id = check_circle_id
  cross join paid p cross join pending pn cross join protected pr
  left join standing s on true
  group by g.target_amount, g.maturity_date, g.lifecycle_status,
    p.amount, pn.amount, pr.amount, gb.beneficiary_name,
    gb.destination_reference, gb.verification_status
$$;

create or replace function public.resolve_circle_protection_terms(
  check_circle_id uuid,
  check_contribution_id uuid,
  out resolved_beneficiary uuid,
  out resolved_maturity date
)
language plpgsql security definer set search_path = public as $$
declare
  contribution_due date;
  kind text;
begin
  select circle_type into kind from public.circles where id = check_circle_id;
  if kind = 'goal' then
    -- The existing protection function requires a UUID while resolving terms.
    -- The ledger trigger below replaces this temporary owner fallback with the
    -- authoritative Goal beneficiary, including NULL for an external person.
    select coalesce(gb.beneficiary_user_id, c.owner_id), gd.maturity_date
      into resolved_beneficiary, resolved_maturity
    from public.goal_susu_details gd
    join public.goal_susu_beneficiaries gb on gb.circle_id = gd.circle_id
    join public.circles c on c.id = gd.circle_id
    where gd.circle_id = check_circle_id;
    return;
  end if;

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

create or replace function public.bind_goal_protected_fund_beneficiary()
returns trigger language plpgsql security definer set search_path = public as $$
declare goal_beneficiary public.goal_susu_beneficiaries;
begin
  if new.fund_type = 'circle' and exists (
    select 1 from public.circles c
    where c.id = new.circle_id and c.circle_type = 'goal'
  ) then
    select * into goal_beneficiary
    from public.goal_susu_beneficiaries where circle_id = new.circle_id;
    if goal_beneficiary.id is null then
      raise exception 'Goal Susu beneficiary is required before funds can be protected';
    end if;
    new.goal_beneficiary_id := goal_beneficiary.id;
    new.beneficiary_user_id := goal_beneficiary.beneficiary_user_id;
    new.metadata := coalesce(new.metadata, '{}'::jsonb) || jsonb_build_object(
      'circle_type', 'goal',
      'goal_beneficiary_id', goal_beneficiary.id,
      'beneficiary_type', goal_beneficiary.beneficiary_type
    );
  end if;
  return new;
end;
$$;

create trigger bind_goal_protected_fund_beneficiary
before insert on public.protected_fund_ledger
for each row execute function public.bind_goal_protected_fund_beneficiary();

create or replace function public.prevent_goal_rotation()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.circles c
    where c.id = new.circle_id and c.circle_type = 'goal'
  ) then
    raise exception 'Goal Susu does not use a rotating payout schedule';
  end if;
  return new;
end;
$$;

create trigger prevent_goal_payout_schedule
before insert on public.payout_schedule
for each row execute function public.prevent_goal_rotation();

create or replace function public.prevent_locked_goal_term_changes()
returns trigger language plpgsql set search_path = public as $$
declare locked boolean;
begin
  select (
    gd.terms_locked_at is not null
    or exists (
      select 1 from public.contributions c
      where c.circle_id = old.id and c.status in ('paid', 'processed')
    )
    or exists (
      select 1 from public.protected_fund_ledger pf where pf.circle_id = old.id
    )
  ) into locked
  from public.goal_susu_details gd where gd.circle_id = old.id;
  if old.circle_type = 'goal' and locked and (
    new.circle_type is distinct from old.circle_type
    or new.goal_amount is distinct from old.goal_amount
    or new.contribution_amount is distinct from old.contribution_amount
    or new.frequency is distinct from old.frequency
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
  ) then raise exception 'Goal Susu financial terms are locked'; end if;
  return new;
end;
$$;

create trigger protect_goal_circle_terms
before update on public.circles
for each row execute function public.prevent_locked_goal_term_changes();

create or replace function public.prevent_locked_goal_beneficiary_changes()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (
    select 1 from public.contributions c
    where c.circle_id = old.circle_id and c.status in ('paid', 'processed')
  ) or exists (
    select 1 from public.protected_fund_ledger pf where pf.circle_id = old.circle_id
  ) then
    if row(
      new.beneficiary_type, new.beneficiary_user_id, new.beneficiary_name,
      new.destination_reference, new.mobile_money_network
    ) is distinct from row(
      old.beneficiary_type, old.beneficiary_user_id, old.beneficiary_name,
      old.destination_reference, old.mobile_money_network
    ) then raise exception 'Use the beneficiary amendment process after financial activity'; end if;
  end if;
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
    and new.verification_status is distinct from old.verification_status then
    raise exception 'Beneficiary verification is server-controlled';
  end if;
  return new;
end;
$$;

create trigger protect_goal_beneficiary
before update on public.goal_susu_beneficiaries
for each row execute function public.prevent_locked_goal_beneficiary_changes();

create or replace function public.request_goal_beneficiary_change(
  check_circle_id uuid,
  proposed_type text,
  proposed_user_id uuid,
  proposed_name text,
  proposed_destination text,
  proposed_network text,
  change_reason text
)
returns public.goal_beneficiary_change_requests
language plpgsql security definer set search_path = public as $$
declare current_beneficiary public.goal_susu_beneficiaries;
declare created_request public.goal_beneficiary_change_requests;
begin
  if not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only a Circle admin can request a beneficiary amendment';
  end if;
  if exists (
    select 1 from public.goal_beneficiary_change_requests
    where circle_id = check_circle_id and status = 'pending'
  ) then raise exception 'A beneficiary amendment is already pending'; end if;
  select * into current_beneficiary
  from public.goal_susu_beneficiaries where circle_id = check_circle_id;
  if current_beneficiary.id is null then raise exception 'Goal beneficiary not found'; end if;

  insert into public.goal_beneficiary_change_requests(
    circle_id, old_beneficiary_id, proposed_beneficiary_type,
    proposed_beneficiary_user_id, proposed_beneficiary_name,
    proposed_destination_reference, proposed_mobile_money_network,
    reason, requested_by
  ) values (
    check_circle_id, current_beneficiary.id, proposed_type,
    proposed_user_id, trim(proposed_name), trim(proposed_destination),
    nullif(trim(proposed_network), ''), trim(change_reason), auth.uid()
  ) returning * into created_request;
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(), 'beneficiary_change_requested', 'goal_beneficiary_change',
    created_request.id, 'Goal Susu beneficiary amendment requested.',
    jsonb_build_object('circle_id', check_circle_id)
  );
  return created_request;
end;
$$;

create or replace function public.approve_goal_beneficiary_change(check_request_id uuid)
returns public.goal_beneficiary_change_requests
language plpgsql security definer set search_path = public as $$
declare request_record public.goal_beneficiary_change_requests;
declare member public.circle_members;
begin
  select * into request_record from public.goal_beneficiary_change_requests
  where id = check_request_id and status = 'pending' for update;
  if request_record.id is null then raise exception 'Pending amendment not found'; end if;
  select * into member from public.circle_members
  where circle_id = request_record.circle_id and user_id = auth.uid()
    and status = 'approved';
  if member.id is null then raise exception 'Only approved members can decide'; end if;
  insert into public.goal_beneficiary_change_approvals(
    request_id, membership_id, user_id, decision
  ) values (request_record.id, member.id, auth.uid(), 'approved')
  on conflict (request_id, membership_id)
  do update set decision = 'approved', decided_at = now();
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(), 'beneficiary_change_approved', 'goal_beneficiary_change',
    request_record.id, 'Approved member accepted the proposed beneficiary amendment.',
    jsonb_build_object('circle_id', request_record.circle_id, 'membership_id', member.id)
  );
  return request_record;
end;
$$;

create or replace function public.sync_goal_after_confirmed_contribution()
returns trigger language plpgsql security definer set search_path = public as $$
declare goal public.goal_susu_details;
declare collected numeric;
begin
  if new.status not in ('paid', 'processed')
    or (tg_op = 'UPDATE' and old.status in ('paid', 'processed')) then
    return new;
  end if;
  select gd.* into goal from public.goal_susu_details gd
  join public.circles c on c.id = gd.circle_id
  where gd.circle_id = new.circle_id and c.circle_type = 'goal';
  if goal.circle_id is null then return new; end if;
  update public.goal_susu_details set
    terms_locked_at = coalesce(terms_locked_at, now()),
    lifecycle_status = case when lifecycle_status = 'draft' then 'active' else lifecycle_status end,
    updated_at = now()
  where circle_id = new.circle_id;
  select coalesce(sum(amount), 0) into collected
  from public.contributions
  where circle_id = new.circle_id and status in ('paid', 'processed');
  if collected >= goal.target_amount and goal.target_reached_at is null then
    update public.goal_susu_details set target_reached_at = now(), updated_at = now()
    where circle_id = new.circle_id;
    insert into public.notifications(user_id, circle_id, type, title, body)
    select cm.user_id, new.circle_id, 'goal_target_reached',
      'Goal Susu target reached', c.name || ' has reached its savings target.'
    from public.circle_members cm
    join public.circles c on c.id = cm.circle_id
    where cm.circle_id = new.circle_id and cm.status = 'approved';
    insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      null, 'goal_target_reached', 'circle', new.circle_id,
      'Confirmed contributions reached the Goal Susu target.',
      jsonb_build_object('target_amount', goal.target_amount, 'collected_amount', collected)
    );
  end if;
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    null, 'goal_contribution_confirmed', 'contribution', new.id,
    'Confirmed Goal Susu contribution recorded.',
    jsonb_build_object('circle_id', new.circle_id, 'amount', new.amount)
  );
  return new;
end;
$$;

create trigger sync_goal_confirmed_contribution
after insert or update of status on public.contributions
for each row execute function public.sync_goal_after_confirmed_contribution();

alter table public.fund_releases
  drop constraint fund_releases_release_type_check,
  add constraint fund_releases_release_type_check
    check (release_type in ('circle_payout', 'piggy_maturity', 'goal_susu_payout'));
alter table public.fund_releases
  add column goal_beneficiary_id uuid
    references public.goal_susu_beneficiaries(id) on delete restrict,
  alter column beneficiary_user_id drop not null,
  drop constraint fund_releases_target_check,
  add constraint fund_releases_target_check check (
    (release_type = 'circle_payout' and circle_id is not null
      and piggy_id is null and payout_schedule_id is not null
      and goal_beneficiary_id is null and beneficiary_user_id is not null)
    or
    (release_type = 'piggy_maturity' and piggy_id is not null
      and circle_id is null and payout_schedule_id is null
      and goal_beneficiary_id is null and beneficiary_user_id is not null)
    or
    (release_type = 'goal_susu_payout' and circle_id is not null
      and piggy_id is null and payout_schedule_id is null
      and goal_beneficiary_id is not null)
  );

alter table public.payout_receipts
  add column goal_beneficiary_id uuid
    references public.goal_susu_beneficiaries(id) on delete restrict,
  alter column beneficiary_user_id drop not null;
create unique index fund_releases_goal_success_key
  on public.fund_releases(circle_id)
  where release_type = 'goal_susu_payout' and status <> 'cancelled';
create policy "Payout receipts: Goal members view"
  on public.payout_receipts for select using (
    goal_beneficiary_id is not null and exists (
      select 1
      from public.goal_susu_beneficiaries gb
      join public.circle_members cm on cm.circle_id = gb.circle_id
      where gb.id = payout_receipts.goal_beneficiary_id
        and cm.user_id = auth.uid() and cm.status = 'approved'
    )
  );

-- Goal payout candidates extend the existing preview architecture without
-- changing or reclassifying existing rotational and Piggy preview rows.
create or replace function public.get_goal_susu_payout_preview(as_of_date date default current_date)
returns table(
  candidate_key text, release_type text, circle_id uuid,
  beneficiary_user_id uuid, beneficiary_name text,
  amount numeric, currency text, maturity_date date,
  protected_funds_available numeric, frozen_amount numeric,
  payment_destination_type text, payment_destination_summary text,
  eligibility text, blocking_reason text, is_test_record boolean
)
language sql security definer stable set search_path = public as $$
  with candidates as (
    select
      'goal:' || c.id::text candidate_key,
      c.id circle_id, gb.beneficiary_user_id, gb.beneficiary_name,
      gd.target_amount amount, c.base_currency::text currency,
      gd.maturity_date,
      coalesce(funds.protected_amount, 0) protected_amount,
      coalesce(funds.frozen_amount, 0) frozen_amount,
      coalesce(funds.test_record, false) test_record,
      gb.verification_status,
      coalesce(agreements.accepted_members, 0) accepted_members,
      coalesce(agreements.approved_members, 0) approved_members,
      exists (
        select 1 from public.protection_reconciliation_queue q
        where q.status in ('open', 'investigating')
          and (q.details->>'circle_id' = c.id::text
            or exists (
              select 1 from public.protected_fund_ledger qpf
              where qpf.id = q.protected_fund_id and qpf.circle_id = c.id
            ))
      ) reconciliation_block,
      exists (
        select 1 from public.fund_releases fr
        where fr.circle_id = c.id and fr.release_type = 'goal_susu_payout'
          and fr.status <> 'cancelled'
      ) existing_release
    from public.circles c
    join public.goal_susu_details gd on gd.circle_id = c.id
    join public.goal_susu_beneficiaries gb on gb.circle_id = c.id
    left join lateral (
      select
        coalesce(sum(pf.amount) filter (
          where pf.status in ('protected', 'matured')
            and not exists (
              select 1 from public.fund_release_allocations a
              where a.protected_fund_ledger_id = pf.id
            )
        ), 0) protected_amount,
        coalesce(sum(pf.amount) filter (where pf.status = 'frozen'), 0) frozen_amount,
        bool_or(public.protected_fund_is_test_record(pf)) test_record
      from public.protected_fund_ledger pf where pf.circle_id = c.id
    ) funds on true
    left join lateral (
      select count(a.id) accepted_members, count(cm.id) approved_members
      from public.circle_members cm
      left join public.goal_susu_member_acceptances a
        on a.circle_id = c.id and a.membership_id = cm.id
      where cm.circle_id = c.id and cm.status = 'approved'
    ) agreements on true
    where c.circle_type = 'goal'
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
    cl.beneficiary_user_id, cl.beneficiary_name, cl.amount, cl.currency,
    cl.maturity_date, cl.protected_amount, cl.frozen_amount, 'mobile_money',
    public.mask_goal_destination(gb.destination_reference), cl.eligibility,
    case cl.eligibility
      when 'READY' then null
      when 'BLOCKED_TEST_RECORD' then 'Test-funded Goal Susu cannot execute.'
      when 'BLOCKED_NOT_MATURED' then 'Goal Susu has not matured.'
      when 'BLOCKED_NO_DESTINATION' then 'Beneficiary destination is not verified.'
      when 'BLOCKED_TERMS_NOT_ACCEPTED' then 'Every approved member must accept the Goal Susu terms.'
      when 'BLOCKED_RECONCILIATION' then 'An unresolved protection issue blocks payout.'
      when 'BLOCKED_FROZEN' then 'Protected funds are frozen.'
      when 'BLOCKED_ALREADY_RELEASED' then 'A payout release already exists.'
      when 'BLOCKED_INSUFFICIENT_FUNDS' then 'Protected funds are below the Goal target.'
      else 'Eligibility could not be proven.'
    end,
    coalesce(cl.test_record, false)
  from classified cl
  join public.goal_susu_beneficiaries gb on gb.circle_id = cl.circle_id
  where auth.role() = 'service_role'
    or public.current_user_staff_role() is not null
    or public.user_has_circle_membership(cl.circle_id, auth.uid())
$$;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'join_request', 'membership_approved', 'membership_rejected',
  'payment_due_tomorrow', 'payment_due_today', 'payment_successful',
  'payment_failed', 'payment_retry_scheduled', 'payment_overdue',
  'payout_due', 'payout_matured', 'payout_processing',
  'payout_successful', 'payout_failed',
  'goal_progress', 'goal_target_reached', 'goal_matured',
  'goal_payout_processing', 'goal_payout_successful'
));

revoke all on function public.create_goal_susu(
  text,text,numeric,numeric,text,date,date,integer,text,text,text,uuid,text,text,text,text
) from public, anon;
grant execute on function public.create_goal_susu(
  text,text,numeric,numeric,text,date,date,integer,text,text,text,uuid,text,text,text,text
) to authenticated;
revoke all on function public.get_goal_susu_join_preview(text) from public, anon;
grant execute on function public.get_goal_susu_join_preview(text) to authenticated;
revoke all on function public.accept_goal_susu_terms(uuid) from public, anon;
grant execute on function public.accept_goal_susu_terms(uuid) to authenticated;
revoke all on function public.goal_susu_progress(uuid) from public, anon;
grant execute on function public.goal_susu_progress(uuid) to authenticated;
revoke all on function public.get_goal_susu_payout_preview(date) from public, anon;
grant execute on function public.get_goal_susu_payout_preview(date) to authenticated;
revoke all on function public.mask_goal_destination(text) from public, anon;
grant execute on function public.mask_goal_destination(text) to authenticated;
revoke all on function public.request_goal_beneficiary_change(
  uuid,text,uuid,text,text,text,text
) from public, anon;
grant execute on function public.request_goal_beneficiary_change(
  uuid,text,uuid,text,text,text,text
) to authenticated;
revoke all on function public.approve_goal_beneficiary_change(uuid) from public, anon;
grant execute on function public.approve_goal_beneficiary_change(uuid) to authenticated;

notify pgrst, 'reload schema';
