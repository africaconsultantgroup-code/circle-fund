-- 0073_governance_risk_foundation.sql
-- Working Group 4A: auditable, role-separated governance and risk controls.
-- This migration does not move, release, redirect, or recalculate protected funds.

create table if not exists public.member_standings (
  user_id uuid primary key references auth.users(id) on delete restrict,
  standing text not null default 'good'
    check (standing in ('excellent', 'good', 'attention_required', 'at_risk', 'suspended')),
  score integer not null default 80 check (score between 0 and 100),
  late_payment_count integer not null default 0 check (late_payment_count >= 0),
  missed_payment_count integer not null default 0 check (missed_payment_count >= 0),
  successful_payment_count integer not null default 0 check (successful_payment_count >= 0),
  completed_circle_count integer not null default 0 check (completed_circle_count >= 0),
  active_dispute_count integer not null default 0 check (active_dispute_count >= 0),
  fraud_flag_count integer not null default 0 check (fraud_flag_count >= 0),
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.circle_health_scores (
  circle_id uuid primary key references public.circles(id) on delete restrict,
  health text not null default 'healthy'
    check (health in ('healthy', 'watch', 'at_risk', 'critical')),
  score integer not null default 100 check (score between 0 and 100),
  expected_payment_count integer not null default 0 check (expected_payment_count >= 0),
  successful_payment_count integer not null default 0 check (successful_payment_count >= 0),
  late_payment_count integer not null default 0 check (late_payment_count >= 0),
  missed_payment_count integer not null default 0 check (missed_payment_count >= 0),
  outstanding_amount numeric(14,2) not null default 0 check (outstanding_amount >= 0),
  active_dispute_count integer not null default 0 check (active_dispute_count >= 0),
  open_removal_count integer not null default 0 check (open_removal_count >= 0),
  calculated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.governance_requests (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique default ('GOV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  request_type text not null check (request_type in (
    'member_removal', 'payment_extension', 'grace_period', 'partial_payment',
    'temporary_pause', 'creator_transfer', 'beneficiary_change', 'goal_extension',
    'goal_contribution_change', 'goal_close'
  )),
  circle_id uuid not null references public.circles(id) on delete restrict,
  subject_user_id uuid references auth.users(id) on delete restrict,
  subject_membership_id uuid references public.circle_members(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason_code text not null,
  details text,
  evidence_summary text,
  status text not null default 'pending'
    check (status in ('pending', 'under_review', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  decision_reason text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (request_type <> 'member_removal' or subject_membership_id is not null)
);

create table if not exists public.governance_disputes (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique default ('DSP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  dispute_type text not null check (dispute_type in (
    'payment', 'contribution', 'beneficiary', 'member_removal', 'creator', 'payout'
  )),
  circle_id uuid references public.circles(id) on delete restrict,
  opened_by uuid not null references auth.users(id) on delete restrict,
  against_user_id uuid references auth.users(id) on delete restrict,
  related_request_id uuid references public.governance_requests(id) on delete restrict,
  related_transaction_id uuid references public.payment_transactions(id) on delete restrict,
  title text not null,
  description text not null,
  status text not null default 'open'
    check (status in ('open', 'under_review', 'awaiting_evidence', 'resolved', 'dismissed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  assigned_to uuid references auth.users(id) on delete restrict,
  decision text,
  decided_by uuid references auth.users(id) on delete restrict,
  opened_at timestamptz not null default now(),
  decided_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.governance_evidence (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.governance_requests(id) on delete restrict,
  dispute_id uuid references public.governance_disputes(id) on delete restrict,
  submitted_by uuid not null references auth.users(id) on delete restrict,
  evidence_type text not null default 'note'
    check (evidence_type in ('note', 'document_reference', 'payment_reference', 'provider_reference')),
  content text not null,
  created_at timestamptz not null default now(),
  check ((request_id is not null)::integer + (dispute_id is not null)::integer = 1)
);

create table if not exists public.governance_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'member_warning', 'late_payment', 'missed_payment', 'standing_changed',
    'removal_requested', 'removal_approved', 'removal_rejected',
    'payment_arrangement', 'dispute_opened', 'dispute_closed', 'fraud_flagged',
    'creator_changed', 'goal_extended', 'goal_shortfall', 'health_changed'
  )),
  actor_user_id uuid references auth.users(id) on delete restrict,
  actor_role text not null,
  subject_user_id uuid references auth.users(id) on delete restrict,
  circle_id uuid references public.circles(id) on delete restrict,
  request_id uuid references public.governance_requests(id) on delete restrict,
  dispute_id uuid references public.governance_disputes(id) on delete restrict,
  contribution_id uuid references public.contributions(id) on delete restrict,
  description text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_risk_events (
  id uuid primary key default gen_random_uuid(),
  contribution_id uuid not null references public.contributions(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  circle_id uuid not null references public.circles(id) on delete restrict,
  risk_status text not null check (risk_status in ('late', 'missed')),
  consecutive_missed_count integer not null default 0 check (consecutive_missed_count >= 0),
  amount_outstanding numeric(14,2) not null default 0 check (amount_outstanding >= 0),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (contribution_id, risk_status)
);

create index if not exists governance_requests_status_idx
  on public.governance_requests(status, request_type, requested_at desc);
create index if not exists governance_requests_circle_idx
  on public.governance_requests(circle_id, requested_at desc);
create index if not exists governance_disputes_status_idx
  on public.governance_disputes(status, priority, opened_at desc);
create index if not exists governance_disputes_circle_idx
  on public.governance_disputes(circle_id, opened_at desc);
create index if not exists governance_events_circle_idx
  on public.governance_events(circle_id, created_at desc);
create index if not exists governance_events_subject_idx
  on public.governance_events(subject_user_id, created_at desc);
create index if not exists payment_risk_events_user_idx
  on public.payment_risk_events(user_id, detected_at desc);

alter table public.member_standings enable row level security;
alter table public.circle_health_scores enable row level security;
alter table public.governance_requests enable row level security;
alter table public.governance_disputes enable row level security;
alter table public.governance_evidence enable row level security;
alter table public.governance_events enable row level security;
alter table public.payment_risk_events enable row level security;

create policy "Members view own standing"
  on public.member_standings for select
  using (user_id = auth.uid());
create policy "Staff view member standings"
  on public.member_standings for select
  using (public.current_user_staff_role() is not null);

create policy "Circle members view health"
  on public.circle_health_scores for select
  using (public.is_approved_circle_member(circle_id, auth.uid()));
create policy "Staff view circle health"
  on public.circle_health_scores for select
  using (public.current_user_staff_role() is not null);

create policy "Participants view governance requests"
  on public.governance_requests for select
  using (
    requested_by = auth.uid()
    or subject_user_id = auth.uid()
    or public.is_circle_admin(circle_id, auth.uid())
    or public.current_user_staff_role() is not null
  );
create policy "Participants view disputes"
  on public.governance_disputes for select
  using (
    opened_by = auth.uid()
    or against_user_id = auth.uid()
    or (circle_id is not null and public.is_circle_admin(circle_id, auth.uid()))
    or public.current_user_staff_role() is not null
  );
create policy "Case participants view evidence"
  on public.governance_evidence for select
  using (
    submitted_by = auth.uid()
    or public.current_user_staff_role() is not null
    or exists (
      select 1 from public.governance_requests gr
      where gr.id = governance_evidence.request_id
        and (gr.requested_by = auth.uid() or gr.subject_user_id = auth.uid()
          or public.is_circle_admin(gr.circle_id, auth.uid()))
    )
    or exists (
      select 1 from public.governance_disputes gd
      where gd.id = governance_evidence.dispute_id
        and (gd.opened_by = auth.uid() or gd.against_user_id = auth.uid()
          or (gd.circle_id is not null and public.is_circle_admin(gd.circle_id, auth.uid())))
    )
  );
create policy "Members view relevant governance events"
  on public.governance_events for select
  using (
    actor_user_id = auth.uid()
    or subject_user_id = auth.uid()
    or (circle_id is not null and public.is_approved_circle_member(circle_id, auth.uid()))
    or public.current_user_staff_role() is not null
  );
create policy "Members view own payment risk"
  on public.payment_risk_events for select
  using (
    user_id = auth.uid()
    or public.is_circle_admin(circle_id, auth.uid())
    or public.current_user_staff_role() is not null
  );

create or replace function public.refresh_member_standing(check_user_id uuid)
returns public.member_standings
language plpgsql
security definer
set search_path = public
as $$
declare
  late_count integer;
  missed_count integer;
  paid_count integer;
  dispute_count integer;
  fraud_count integer;
  completed_count integer;
  calculated_score integer;
  calculated_standing text;
  previous_standing text;
  result_row public.member_standings;
begin
  select
    count(*) filter (where status = 'late'),
    count(*) filter (where status in ('overdue', 'failed')),
    count(*) filter (where status in ('paid', 'processed'))
  into late_count, missed_count, paid_count
  from public.contributions where user_id = check_user_id;

  select count(*) into dispute_count
  from public.governance_disputes
  where (opened_by = check_user_id or against_user_id = check_user_id)
    and status in ('open', 'under_review', 'awaiting_evidence');

  select count(*) into fraud_count
  from public.governance_events
  where subject_user_id = check_user_id and event_type = 'fraud_flagged';

  select count(distinct cm.circle_id) into completed_count
  from public.circle_members cm
  join public.circles c on c.id = cm.circle_id
  where cm.user_id = check_user_id and cm.status = 'approved' and c.status = 'completed';

  calculated_score := greatest(0, least(100,
    80 + least(paid_count, 10) * 2 + completed_count * 3
    - late_count * 5 - missed_count * 10 - dispute_count * 4 - fraud_count * 30
  ));
  calculated_standing := case
    when fraud_count > 0 or calculated_score < 30 then 'suspended'
    when calculated_score < 50 then 'at_risk'
    when calculated_score < 70 then 'attention_required'
    when calculated_score >= 90 then 'excellent'
    else 'good'
  end;

  select standing into previous_standing
  from public.member_standings where user_id = check_user_id;

  insert into public.member_standings(
    user_id, standing, score, late_payment_count, missed_payment_count,
    successful_payment_count, completed_circle_count, active_dispute_count,
    fraud_flag_count, calculated_at, updated_at
  ) values (
    check_user_id, calculated_standing, calculated_score, late_count, missed_count,
    paid_count, completed_count, dispute_count, fraud_count, now(), now()
  )
  on conflict (user_id) do update set
    standing = excluded.standing, score = excluded.score,
    late_payment_count = excluded.late_payment_count,
    missed_payment_count = excluded.missed_payment_count,
    successful_payment_count = excluded.successful_payment_count,
    completed_circle_count = excluded.completed_circle_count,
    active_dispute_count = excluded.active_dispute_count,
    fraud_flag_count = excluded.fraud_flag_count,
    calculated_at = now(), updated_at = now()
  returning * into result_row;

  if previous_standing is distinct from calculated_standing then
    insert into public.governance_events(
      event_type, actor_role, subject_user_id, description, metadata
    ) values (
      'standing_changed', 'system_automation', check_user_id,
      'Member standing recalculated by governance rules.',
      jsonb_build_object('previous', previous_standing, 'current', calculated_standing,
        'score', calculated_score)
    );
  end if;
  return result_row;
end;
$$;

create or replace function public.refresh_circle_health(check_circle_id uuid)
returns public.circle_health_scores
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_count integer;
  paid_count integer;
  late_count integer;
  missed_count integer;
  disputes integer;
  removals integer;
  outstanding numeric;
  calculated_score integer;
  calculated_health text;
  previous_health text;
  result_row public.circle_health_scores;
begin
  select count(*),
    count(*) filter (where status in ('paid', 'processed')),
    count(*) filter (where status = 'late'),
    count(*) filter (where status in ('overdue', 'failed')),
    coalesce(sum(case when status in ('paid', 'processed') then 0
      else coalesce(amount_due, amount, 0) end), 0)
  into expected_count, paid_count, late_count, missed_count, outstanding
  from public.contributions where circle_id = check_circle_id;

  select count(*) into disputes from public.governance_disputes
  where circle_id = check_circle_id and status in ('open', 'under_review', 'awaiting_evidence');
  select count(*) into removals from public.governance_requests
  where circle_id = check_circle_id and request_type = 'member_removal'
    and status in ('pending', 'under_review');

  calculated_score := greatest(0, least(100,
    case when expected_count = 0 then 100
      else round((paid_count::numeric / expected_count::numeric) * 100)::integer end
    - late_count * 4 - missed_count * 8 - disputes * 8 - removals * 5
  ));
  calculated_health := case
    when calculated_score < 40 then 'critical'
    when calculated_score < 60 then 'at_risk'
    when calculated_score < 80 then 'watch'
    else 'healthy'
  end;

  select health into previous_health from public.circle_health_scores
  where circle_id = check_circle_id;

  insert into public.circle_health_scores(
    circle_id, health, score, expected_payment_count, successful_payment_count,
    late_payment_count, missed_payment_count, outstanding_amount,
    active_dispute_count, open_removal_count, calculated_at, updated_at
  ) values (
    check_circle_id, calculated_health, calculated_score, expected_count, paid_count,
    late_count, missed_count, outstanding, disputes, removals, now(), now()
  )
  on conflict (circle_id) do update set
    health = excluded.health, score = excluded.score,
    expected_payment_count = excluded.expected_payment_count,
    successful_payment_count = excluded.successful_payment_count,
    late_payment_count = excluded.late_payment_count,
    missed_payment_count = excluded.missed_payment_count,
    outstanding_amount = excluded.outstanding_amount,
    active_dispute_count = excluded.active_dispute_count,
    open_removal_count = excluded.open_removal_count,
    calculated_at = now(), updated_at = now()
  returning * into result_row;

  if previous_health is distinct from calculated_health then
    insert into public.governance_events(
      event_type, actor_role, circle_id, description, metadata
    ) values (
      'health_changed', 'system_automation', check_circle_id,
      'Circle health recalculated by governance rules.',
      jsonb_build_object('previous', previous_health, 'current', calculated_health,
        'score', calculated_score)
    );
  end if;
  return result_row;
end;
$$;

create or replace function public.track_contribution_governance_risk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  risk_kind text;
  consecutive_count integer;
begin
  if new.status in ('late', 'overdue', 'failed')
    and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    risk_kind := case when new.status = 'late' then 'late' else 'missed' end;
    select count(*) + 1 into consecutive_count
    from public.contributions c
    where c.user_id = new.user_id and c.circle_id = new.circle_id
      and c.id <> new.id and c.due_date <= new.due_date
      and c.status in ('overdue', 'failed');

    insert into public.payment_risk_events(
      contribution_id, user_id, circle_id, risk_status,
      consecutive_missed_count, amount_outstanding
    ) values (
      new.id, new.user_id, new.circle_id, risk_kind,
      case when risk_kind = 'missed' then consecutive_count else 0 end,
      coalesce(new.amount_due, new.amount, 0)
    ) on conflict (contribution_id, risk_status) do nothing;

    insert into public.governance_events(
      event_type, actor_role, subject_user_id, circle_id, contribution_id,
      description, metadata
    ) values (
      case when risk_kind = 'late' then 'late_payment' else 'missed_payment' end,
      'system_automation', new.user_id, new.circle_id, new.id,
      case when risk_kind = 'late' then 'Scheduled contribution became late.'
        else 'Scheduled contribution was missed.' end,
      jsonb_build_object('status', new.status, 'consecutive_missed_count', consecutive_count)
    );
  end if;

  perform public.refresh_member_standing(new.user_id);
  perform public.refresh_circle_health(new.circle_id);
  return new;
end;
$$;

drop trigger if exists contributions_governance_risk on public.contributions;
create trigger contributions_governance_risk
after insert or update of status on public.contributions
for each row execute function public.track_contribution_governance_risk();

create or replace function public.submit_governance_request(
  check_circle_id uuid,
  check_request_type text,
  check_reason_code text,
  check_details text default null,
  check_subject_membership_id uuid default null,
  check_evidence_summary text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.circle_members;
  created_request public.governance_requests;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only a Circle Creator or administrator can submit this request';
  end if;
  if check_request_type not in (
    'member_removal', 'payment_extension', 'grace_period', 'partial_payment',
    'temporary_pause', 'creator_transfer', 'beneficiary_change', 'goal_extension',
    'goal_contribution_change', 'goal_close'
  ) then raise exception 'Unsupported governance request'; end if;

  if check_subject_membership_id is not null then
    select * into target_member from public.circle_members
    where id = check_subject_membership_id and circle_id = check_circle_id;
    if target_member.id is null then raise exception 'Circle member not found'; end if;
    if target_member.user_id = auth.uid() and check_request_type = 'member_removal' then
      raise exception 'A creator cannot submit their own removal request';
    end if;
  end if;

  insert into public.governance_requests(
    request_type, circle_id, subject_user_id, subject_membership_id,
    requested_by, reason_code, details, evidence_summary
  ) values (
    check_request_type, check_circle_id, target_member.user_id,
    check_subject_membership_id, auth.uid(), check_reason_code,
    nullif(trim(check_details), ''), nullif(trim(check_evidence_summary), '')
  ) returning * into created_request;

  insert into public.governance_events(
    event_type, actor_user_id, actor_role, subject_user_id, circle_id,
    request_id, description, metadata
  ) values (
    case when check_request_type = 'member_removal' then 'removal_requested'
      else 'payment_arrangement' end,
    auth.uid(), 'circle_administrator', target_member.user_id, check_circle_id,
    created_request.id, 'Governance request submitted for Operations review.',
    jsonb_build_object('request_type', check_request_type, 'reason_code', check_reason_code)
  );

  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'governance_request_submitted', 'governance_request',
    created_request.id, 'Creator submitted a governance request.',
    jsonb_build_object('circle_id', check_circle_id, 'request_type', check_request_type,
      'case_id', created_request.case_id, 'actor_role', 'circle_administrator'));

  perform public.refresh_circle_health(check_circle_id);
  return to_jsonb(created_request);
end;
$$;

create or replace function public.open_governance_dispute(
  check_dispute_type text,
  check_title text,
  check_description text,
  check_circle_id uuid default null,
  check_against_user_id uuid default null,
  check_related_request_id uuid default null,
  check_related_transaction_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  created_dispute public.governance_disputes;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if check_dispute_type not in (
    'payment', 'contribution', 'beneficiary', 'member_removal', 'creator', 'payout'
  ) then raise exception 'Unsupported dispute type'; end if;
  if check_circle_id is not null
    and not public.is_approved_circle_member(check_circle_id, auth.uid()) then
    raise exception 'Only Circle participants can open a Circle dispute';
  end if;
  if length(trim(check_title)) < 3 or length(trim(check_description)) < 10 then
    raise exception 'A clear title and description are required';
  end if;

  insert into public.governance_disputes(
    dispute_type, circle_id, opened_by, against_user_id, related_request_id,
    related_transaction_id, title, description
  ) values (
    check_dispute_type, check_circle_id, auth.uid(), check_against_user_id,
    check_related_request_id, check_related_transaction_id,
    trim(check_title), trim(check_description)
  ) returning * into created_dispute;

  insert into public.governance_events(
    event_type, actor_user_id, actor_role, subject_user_id, circle_id,
    dispute_id, description, metadata
  ) values (
    'dispute_opened', auth.uid(), 'member', check_against_user_id, check_circle_id,
    created_dispute.id, 'A governance dispute was opened.',
    jsonb_build_object('dispute_type', check_dispute_type, 'case_id', created_dispute.case_id)
  );
  if check_circle_id is not null then perform public.refresh_circle_health(check_circle_id); end if;
  perform public.refresh_member_standing(auth.uid());
  return to_jsonb(created_dispute);
end;
$$;

create or replace function public.decide_governance_request(
  check_request_id uuid,
  check_decision text,
  check_decision_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  target_request public.governance_requests;
begin
  staff_role := public.current_user_staff_role();
  if staff_role not in ('super_admin', 'operations', 'compliance') then
    raise exception 'Operations or Compliance authorization required';
  end if;
  if check_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;
  if length(trim(check_decision_reason)) < 5 then
    raise exception 'A decision reason is required';
  end if;

  select * into target_request from public.governance_requests
  where id = check_request_id for update;
  if target_request.id is null then raise exception 'Governance request not found'; end if;
  if target_request.status not in ('pending', 'under_review') then
    raise exception 'Governance request has already been decided';
  end if;

  update public.governance_requests set
    status = check_decision, reviewed_by = auth.uid(),
    decision_reason = trim(check_decision_reason), reviewed_at = now(), updated_at = now()
  where id = check_request_id returning * into target_request;

  -- Approved member removal changes membership only. It never changes financial history,
  -- protected balances, beneficiaries, or payout records.
  if check_decision = 'approved' and target_request.request_type = 'member_removal' then
    update public.circle_members set status = 'removed', updated_at = now()
    where id = target_request.subject_membership_id and status = 'approved';
  end if;

  insert into public.governance_events(
    event_type, actor_user_id, actor_role, subject_user_id, circle_id,
    request_id, description, metadata
  ) values (
    case
      when target_request.request_type = 'member_removal' and check_decision = 'approved'
        then 'removal_approved'
      when target_request.request_type = 'member_removal' then 'removal_rejected'
      else 'payment_arrangement'
    end,
    auth.uid(), staff_role, target_request.subject_user_id, target_request.circle_id,
    target_request.id, 'Operations recorded a governance decision.',
    jsonb_build_object('decision', check_decision, 'reason', trim(check_decision_reason))
  );
  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'governance_request_decided', 'governance_request',
    target_request.id, trim(check_decision_reason),
    jsonb_build_object('decision', check_decision, 'staff_role', staff_role,
      'case_id', target_request.case_id));

  if target_request.subject_user_id is not null then
    perform public.refresh_member_standing(target_request.subject_user_id);
  end if;
  perform public.refresh_circle_health(target_request.circle_id);
  return to_jsonb(target_request);
end;
$$;

create or replace function public.get_governance_dashboard()
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  staff_role text;
begin
  staff_role := public.current_user_staff_role();
  if staff_role not in ('super_admin', 'operations', 'compliance') then
    raise exception 'Governance staff authorization required';
  end if;
  return jsonb_build_object(
    'summary', jsonb_build_object(
      'open_requests', (select count(*) from public.governance_requests
        where status in ('pending', 'under_review')),
      'removal_requests', (select count(*) from public.governance_requests
        where request_type = 'member_removal' and status in ('pending', 'under_review')),
      'pending_disputes', (select count(*) from public.governance_disputes
        where status in ('open', 'under_review', 'awaiting_evidence')),
      'standing_alerts', (select count(*) from public.member_standings
        where standing in ('attention_required', 'at_risk', 'suspended')),
      'at_risk_circles', (select count(*) from public.circle_health_scores
        where health in ('at_risk', 'critical')),
      'late_payments', (select count(*) from public.payment_risk_events
        where risk_status = 'late' and resolved_at is null)
    ),
    'requests', coalesce((select jsonb_agg(to_jsonb(r) order by r.requested_at desc)
      from (select gr.id, gr.case_id, gr.request_type, gr.circle_id, c.name as circle_name,
        gr.subject_user_id, gr.reason_code, gr.details, gr.status, gr.requested_at
        from public.governance_requests gr join public.circles c on c.id = gr.circle_id
        where gr.status in ('pending', 'under_review') limit 50) r), '[]'::jsonb),
    'disputes', coalesce((select jsonb_agg(to_jsonb(d) order by d.opened_at desc)
      from (select gd.id, gd.case_id, gd.dispute_type, gd.circle_id, c.name as circle_name,
        gd.title, gd.status, gd.priority, gd.opened_at
        from public.governance_disputes gd left join public.circles c on c.id = gd.circle_id
        where gd.status in ('open', 'under_review', 'awaiting_evidence') limit 50) d), '[]'::jsonb),
    'standing_alerts', coalesce((select jsonb_agg(to_jsonb(s) order by s.score)
      from (select ms.user_id, coalesce(p.full_name, p.name, 'Member') as member_name,
        ms.standing, ms.score, ms.late_payment_count, ms.missed_payment_count,
        ms.active_dispute_count
        from public.member_standings ms left join public.profiles p on p.user_id = ms.user_id
        where ms.standing in ('attention_required', 'at_risk', 'suspended') limit 50) s), '[]'::jsonb),
    'circle_health', coalesce((select jsonb_agg(to_jsonb(h) order by h.score)
      from (select ch.circle_id, c.name as circle_name, ch.health, ch.score,
        ch.outstanding_amount, ch.missed_payment_count, ch.active_dispute_count
        from public.circle_health_scores ch join public.circles c on c.id = ch.circle_id
        order by ch.score limit 50) h), '[]'::jsonb)
  );
end;
$$;

-- Existing Circle admins retain approval/rejection of pending join requests, but approved
-- members can only be removed through an Operations-reviewed governance request.
create or replace function public.manage_circle_member(check_membership_id uuid, action text)
returns public.circle_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.circle_members;
  target_circle public.circles;
  next_status text;
  audit_action text;
begin
  select * into target_member from public.circle_members where id = check_membership_id;
  if target_member.id is null then raise exception 'Member request not found'; end if;
  select * into target_circle from public.circles where id = target_member.circle_id;
  if not public.is_circle_admin(target_member.circle_id, auth.uid()) then
    raise exception 'Only circle admins can manage members';
  end if;
  if action = 'remove' then
    raise exception 'Approved members require an Operations-reviewed removal request';
  end if;
  if action not in ('approve', 'reject') then raise exception 'Unsupported member action'; end if;
  if target_member.status <> 'pending' then
    raise exception 'Only pending membership requests can be approved or rejected';
  end if;
  if target_member.requires_capacity_review
    and target_member.capacity_review_status <> 'approved' and action = 'approve' then
    raise exception 'SikaCircle needs to review this member capacity before approval';
  end if;

  next_status := case when action = 'approve' then 'approved' else 'rejected' end;
  audit_action := case when action = 'approve' then 'approve_circle_member'
    else 'reject_circle_member' end;
  update public.circle_members set
    status = next_status,
    approved_at = case when next_status = 'approved' then now() else approved_at end,
    approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
    updated_at = now()
  where id = check_membership_id returning * into target_member;

  insert into public.audit_logs(staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), audit_action, 'circle_member', target_member.id,
    'Circle administrator decided a pending membership request.',
    jsonb_build_object('actor_role', 'circle_administrator', 'circle_id', target_member.circle_id,
      'member_user_id', target_member.user_id, 'new_status', target_member.status));
  return target_member;
end;
$$;

revoke all on function public.refresh_member_standing(uuid) from public, anon, authenticated;
revoke all on function public.refresh_circle_health(uuid) from public, anon, authenticated;
revoke all on function public.submit_governance_request(uuid, text, text, text, uuid, text)
  from public, anon;
revoke all on function public.open_governance_dispute(text, text, text, uuid, uuid, uuid, uuid)
  from public, anon;
revoke all on function public.decide_governance_request(uuid, text, text)
  from public, anon;
revoke all on function public.get_governance_dashboard() from public, anon;

grant execute on function public.submit_governance_request(uuid, text, text, text, uuid, text)
  to authenticated;
grant execute on function public.open_governance_dispute(text, text, text, uuid, uuid, uuid, uuid)
  to authenticated;
grant execute on function public.decide_governance_request(uuid, text, text)
  to authenticated;
grant execute on function public.get_governance_dashboard() to authenticated;

insert into public.member_standings(user_id)
select au.id from auth.users au
on conflict (user_id) do nothing;
insert into public.circle_health_scores(circle_id)
select c.id from public.circles c
on conflict (circle_id) do nothing;

do $$
declare item record;
begin
  for item in select user_id from public.member_standings loop
    perform public.refresh_member_standing(item.user_id);
  end loop;
  for item in select circle_id from public.circle_health_scores loop
    perform public.refresh_circle_health(item.circle_id);
  end loop;
end;
$$;
