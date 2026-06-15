-- 0041_circle_limits_capacity_payout_controls.sql
-- Refines Circle Admin limits, extra-circle capacity review, and finance payout controls.

alter table public.circle_members
  add column if not exists requires_capacity_review boolean not null default false,
  add column if not exists capacity_review_status text not null default 'not_required',
  add column if not exists capacity_review_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'circle_members_capacity_review_status_check'
      and conrelid = 'public.circle_members'::regclass
  ) then
    alter table public.circle_members
      add constraint circle_members_capacity_review_status_check
      check (capacity_review_status in ('not_required', 'pending', 'approved', 'rejected'));
  end if;
end $$;

create table if not exists public.capacity_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid not null references public.circles(id) on delete cascade,
  member_id uuid references public.circle_members(id) on delete set null,
  active_circle_count integer not null default 0,
  estimated_periodic_obligation numeric not null default 0,
  requested_reason text,
  income_employment_info text,
  missed_late_contribution_count integer not null default 0,
  trust_score numeric,
  verification_status text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, circle_id)
);

alter table public.capacity_reviews enable row level security;

create index if not exists capacity_reviews_status_idx on public.capacity_reviews (status, created_at desc);
create index if not exists capacity_reviews_user_id_idx on public.capacity_reviews (user_id, created_at desc);

drop policy if exists "Capacity reviews: users can select own rows" on public.capacity_reviews;
create policy "Capacity reviews: users can select own rows"
  on public.capacity_reviews
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Capacity reviews: staff can select rows" on public.capacity_reviews;
create policy "Capacity reviews: staff can select rows"
  on public.capacity_reviews
  as permissive
  for select
  using (public.current_user_staff_role() in ('super_admin', 'compliance'));

create or replace function public.user_active_circle_admin_count(check_user_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.circles c
  where c.owner_id = check_user_id
    and c.status = 'active';
$$;

create or replace function public.user_active_circle_count(check_user_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(distinct cm.circle_id)::integer
  from public.circle_members cm
  join public.circles c on c.id = cm.circle_id
  where cm.user_id = check_user_id
    and cm.status in ('pending', 'approved')
    and c.status = 'active';
$$;

create or replace function public.user_periodic_obligation(check_user_id uuid)
returns numeric
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(coalesce(c.contribution_amount, 0)), 0)
  from public.circle_members cm
  join public.circles c on c.id = cm.circle_id
  where cm.user_id = check_user_id
    and cm.status in ('pending', 'approved')
    and c.status = 'active';
$$;

create or replace function public.user_missed_late_contribution_count(check_user_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.contributions c
  where c.user_id = check_user_id
    and c.status::text in ('late', 'overdue', 'failed');
$$;

drop policy if exists "Circles: eligible users can insert circles" on public.circles;
create policy "Circles: eligible users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (
    auth.uid() = owner_id
    and public.user_passes_circle_onboarding(auth.uid())
    and public.user_active_circle_admin_count(auth.uid()) < 2
  );

create or replace function public.flag_capacity_review_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  obligation numeric;
  verification text;
begin
  if new.role in ('creator', 'admin') then
    new.requires_capacity_review := false;
    new.capacity_review_status := 'not_required';
    return new;
  end if;

  active_count := public.user_active_circle_count(new.user_id);

  if active_count >= 3 then
    obligation := public.user_periodic_obligation(new.user_id);

    select uv.verification_status::text
    into verification
    from public.user_verifications uv
    where uv.user_id = new.user_id
    limit 1;

    new.requires_capacity_review := true;
    new.capacity_review_status := 'pending';
    new.status := 'pending';

    insert into public.capacity_reviews (
      user_id,
      circle_id,
      active_circle_count,
      estimated_periodic_obligation,
      missed_late_contribution_count,
      verification_status,
      status,
      created_at,
      updated_at
    )
    values (
      new.user_id,
      new.circle_id,
      active_count,
      obligation,
      public.user_missed_late_contribution_count(new.user_id),
      coalesce(verification, 'not_started'),
      'pending',
      now(),
      now()
    )
    on conflict (user_id, circle_id)
    do update set
      active_circle_count = excluded.active_circle_count,
      estimated_periodic_obligation = excluded.estimated_periodic_obligation,
      missed_late_contribution_count = excluded.missed_late_contribution_count,
      verification_status = excluded.verification_status,
      status = 'pending',
      updated_at = now();
  else
    new.requires_capacity_review := false;
    new.capacity_review_status := 'not_required';
  end if;

  return new;
end;
$$;

create or replace function public.audit_circle_creation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    new.owner_id,
    'circle_created',
    'circle',
    new.id,
    'Customer created a susu circle.',
    jsonb_build_object(
      'owner_id', new.owner_id,
      'circle_name', new.name,
      'contribution_amount', new.contribution_amount,
      'frequency', new.frequency,
      'status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_circle_creation_trigger on public.circles;
create trigger audit_circle_creation_trigger
  after insert on public.circles
  for each row
  execute function public.audit_circle_creation();

drop trigger if exists flag_capacity_review_before_insert_trigger on public.circle_members;
create trigger flag_capacity_review_before_insert_trigger
  before insert on public.circle_members
  for each row
  execute function public.flag_capacity_review_before_insert();

create or replace function public.sync_capacity_review_member_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.requires_capacity_review then
    update public.capacity_reviews
    set member_id = new.id,
        updated_at = now()
    where user_id = new.user_id
      and circle_id = new.circle_id;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_capacity_review_member_after_insert_trigger on public.circle_members;
create trigger sync_capacity_review_member_after_insert_trigger
  after insert on public.circle_members
  for each row
  execute function public.sync_capacity_review_member_after_insert();

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
  actor_role text;
begin
  select *
  into target_member
  from public.circle_members
  where id = check_membership_id;

  if target_member.id is null then
    raise exception 'Member request not found';
  end if;

  select *
  into target_circle
  from public.circles
  where id = target_member.circle_id;

  if not public.is_circle_admin(target_member.circle_id, auth.uid()) then
    raise exception 'Only circle admins can manage members';
  end if;

  if target_member.requires_capacity_review and target_member.capacity_review_status <> 'approved' and action = 'approve' then
    raise exception 'SikaCircle needs to review this member capacity before approval';
  end if;

  if action = 'remove' and coalesce(target_circle.start_date, now()) <= now() then
    raise exception 'Members can only be removed by the circle admin before the circle starts';
  end if;

  if action = 'approve' then
    next_status := 'approved';
    audit_action := 'approve_circle_member';
  elsif action = 'reject' then
    next_status := 'rejected';
    audit_action := 'reject_circle_member';
  elsif action = 'remove' then
    next_status := 'removed';
    audit_action := 'remove_circle_member';
  else
    raise exception 'Unsupported member action';
  end if;

  update public.circle_members
  set status = next_status,
      approved_at = case when next_status = 'approved' then now() else approved_at end,
      approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
      updated_at = now()
  where id = check_membership_id
  returning * into target_member;

  actor_role := coalesce(public.current_user_staff_role(), 'circle_admin');

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    audit_action,
    'circle_member',
    target_member.id,
    'Circle admin managed a circle member.',
    jsonb_build_object(
      'actor_role', actor_role,
      'circle_id', target_member.circle_id,
      'member_user_id', target_member.user_id,
      'new_status', target_member.status,
      'requires_capacity_review', target_member.requires_capacity_review,
      'capacity_review_status', target_member.capacity_review_status
    )
  );

  return target_member;
end;
$$;

drop function if exists public.get_circle_members(uuid);
create function public.get_circle_members(check_circle_id uuid)
returns table (
  membership_id uuid,
  circle_id uuid,
  user_id uuid,
  role text,
  status text,
  joined_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  full_name text,
  phone text,
  country text,
  preferred_currency text,
  requires_capacity_review boolean,
  capacity_review_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cm.id,
    cm.circle_id,
    cm.user_id,
    cm.role,
    cm.status,
    cm.joined_at,
    cm.approved_at,
    cm.approved_by,
    p.full_name,
    p.phone,
    p.country,
    p.preferred_currency::text,
    cm.requires_capacity_review,
    cm.capacity_review_status
  from public.circle_members cm
  left join public.profiles p on p.user_id = cm.user_id
  where cm.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or cm.user_id = auth.uid()
      or (
        cm.status = 'approved'
        and public.is_approved_circle_member(check_circle_id, auth.uid())
      )
    )
  order by
    case cm.status
      when 'pending' then 1
      when 'approved' then 2
      when 'rejected' then 3
      else 4
    end,
    cm.joined_at asc nulls last;
$$;

create or replace function public.admin_manage_capacity_review(check_review_id uuid, action text, notes text default null)
returns public.capacity_reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  target_review public.capacity_reviews;
  staff_role text;
  next_status text;
begin
  staff_role := public.current_user_staff_role();

  if staff_role not in ('super_admin', 'compliance') then
    raise exception 'Only compliance or super admin can manage capacity reviews';
  end if;

  if action = 'approve' then
    next_status := 'approved';
  elsif action = 'reject' then
    next_status := 'rejected';
  else
    raise exception 'Unsupported capacity review action';
  end if;

  update public.capacity_reviews
  set status = next_status,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = notes,
      updated_at = now()
  where id = check_review_id
  returning * into target_review;

  if target_review.id is null then
    raise exception 'Capacity review not found';
  end if;

  update public.circle_members
  set capacity_review_status = next_status,
      status = case when next_status = 'rejected' then 'rejected' else status end,
      updated_at = now()
  where id = target_review.member_id;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'capacity_review_' || next_status,
    'capacity_review',
    target_review.id,
    coalesce(notes, 'SikaCircle staff reviewed extra-circle capacity request.'),
    jsonb_build_object(
      'staff_role', staff_role,
      'circle_id', target_review.circle_id,
      'member_id', target_review.member_id,
      'user_id', target_review.user_id,
      'active_circle_count', target_review.active_circle_count
    )
  );

  return target_review;
end;
$$;

create or replace function public.mark_contribution_paid_for_testing(check_contribution_id uuid, payment_reference text default null)
returns public.contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_contribution public.contributions;
  previous_status text;
  staff_role text;
begin
  staff_role := public.current_user_staff_role();

  if staff_role not in ('super_admin', 'finance') then
    raise exception 'Only SikaCircle finance can change contribution payment records';
  end if;

  select *
  into target_contribution
  from public.contributions
  where id = check_contribution_id;

  if target_contribution.id is null then
    raise exception 'Contribution not found';
  end if;

  previous_status := target_contribution.status::text;

  update public.contributions
  set status = 'paid',
      paid_at = now(),
      payment_reference = coalesce(nullif(payment_reference, ''), target_contribution.payment_reference, 'manual-test-' || substr(gen_random_uuid()::text, 1, 8)),
      updated_at = now()
  where id = check_contribution_id
  returning * into target_contribution;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'manual_mark_contribution_paid',
    'contribution',
    target_contribution.id,
    'SikaCircle finance manually marked contribution as paid for testing.',
    jsonb_build_object(
      'actor_role', staff_role,
      'circle_id', target_contribution.circle_id,
      'member_id', target_contribution.member_id,
      'user_id', target_contribution.user_id,
      'old_status', previous_status,
      'new_status', target_contribution.status::text,
      'payment_reference', target_contribution.payment_reference
    )
  );

  return target_contribution;
end;
$$;

drop policy if exists "Contributions: circle admins can update circle obligations" on public.contributions;

drop policy if exists "Payouts: circle owners can insert payouts for owned circles" on public.payouts;
drop policy if exists "Payouts: circle owners can update payout records" on public.payouts;
drop policy if exists "Payouts: finance can insert payout records" on public.payouts;
create policy "Payouts: finance can insert payout records"
  on public.payouts
  as permissive
  for insert
  with check (public.current_user_staff_role() in ('super_admin', 'finance'));

drop policy if exists "Payouts: finance can update payout records" on public.payouts;
create policy "Payouts: finance can update payout records"
  on public.payouts
  as permissive
  for update
  using (public.current_user_staff_role() in ('super_admin', 'finance'))
  with check (public.current_user_staff_role() in ('super_admin', 'finance'));

alter table public.payout_schedule
  add column if not exists automatic_attempted_at timestamptz,
  add column if not exists manual_attempted_at timestamptz,
  add column if not exists payout_reference text,
  add column if not exists hold_reason text;

create or replace function public.list_due_payouts_for_admin()
returns table (
  schedule_id uuid,
  circle_id uuid,
  circle_name text,
  member_id uuid,
  user_id uuid,
  full_name text,
  payout_due_date timestamptz,
  payout_amount numeric,
  status text,
  payout_reference text,
  hold_reason text,
  automatic_attempted_at timestamptz,
  manual_attempted_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ps.id,
    ps.circle_id,
    c.name,
    ps.member_id,
    cm.user_id,
    p.full_name,
    ps.payout_due_date,
    ps.payout_amount,
    ps.status,
    ps.payout_reference,
    ps.hold_reason,
    ps.automatic_attempted_at,
    ps.manual_attempted_at
  from public.payout_schedule ps
  join public.circles c on c.id = ps.circle_id
  join public.circle_members cm on cm.id = ps.member_id
  left join public.profiles p on p.user_id = cm.user_id
  where public.current_user_staff_role() in ('super_admin', 'finance')
  order by ps.payout_due_date asc nulls last;
$$;

create or replace function public.manual_trigger_payout(check_schedule_id uuid, reason text)
returns public.payout_schedule
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  target_schedule public.payout_schedule;
begin
  staff_role := public.current_user_staff_role();

  if staff_role not in ('super_admin', 'finance') then
    raise exception 'Only finance or super admin can manually trigger payout';
  end if;

  if nullif(reason, '') is null then
    raise exception 'A manual payout reason is required';
  end if;

  select *
  into target_schedule
  from public.payout_schedule
  where id = check_schedule_id;

  if target_schedule.id is null then
    raise exception 'Payout schedule not found';
  end if;

  update public.payout_schedule
  set status = 'pending',
      manual_attempted_at = now(),
      payout_reference = coalesce(payout_reference, 'manual-payout-' || substr(gen_random_uuid()::text, 1, 10)),
      updated_at = now()
  where id = check_schedule_id
  returning * into target_schedule;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'manual_payout_attempt',
    'payout_schedule',
    target_schedule.id,
    reason,
    jsonb_build_object(
      'staff_role', staff_role,
      'circle_id', target_schedule.circle_id,
      'member_id', target_schedule.member_id,
      'payout_amount', target_schedule.payout_amount,
      'payout_reference', target_schedule.payout_reference
    )
  );

  return target_schedule;
end;
$$;

create or replace function public.place_payout_hold(check_schedule_id uuid, reason text)
returns public.payout_schedule
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  target_schedule public.payout_schedule;
begin
  staff_role := public.current_user_staff_role();

  if staff_role not in ('super_admin', 'finance') then
    raise exception 'Only finance or super admin can hold payouts';
  end if;

  update public.payout_schedule
  set status = 'skipped',
      hold_reason = reason,
      updated_at = now()
  where id = check_schedule_id
  returning * into target_schedule;

  if target_schedule.id is null then
    raise exception 'Payout schedule not found';
  end if;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'payout_hold', 'payout_schedule', target_schedule.id, reason, jsonb_build_object('staff_role', staff_role));

  return target_schedule;
end;
$$;

create or replace function public.release_payout_hold(check_schedule_id uuid, reason text default null)
returns public.payout_schedule
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  target_schedule public.payout_schedule;
begin
  staff_role := public.current_user_staff_role();

  if staff_role not in ('super_admin', 'finance') then
    raise exception 'Only finance or super admin can release payout holds';
  end if;

  update public.payout_schedule
  set status = 'scheduled',
      hold_reason = null,
      updated_at = now()
  where id = check_schedule_id
  returning * into target_schedule;

  if target_schedule.id is null then
    raise exception 'Payout schedule not found';
  end if;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (auth.uid(), 'payout_hold_released', 'payout_schedule', target_schedule.id, reason, jsonb_build_object('staff_role', staff_role));

  return target_schedule;
end;
$$;

create or replace function public.process_due_payouts_placeholder()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  payout_record public.payout_schedule;
  processed_count integer := 0;
begin
  for payout_record in
    select *
    from public.payout_schedule
    where payout_due_date <= now()
      and status in ('scheduled', 'failed')
      and hold_reason is null
    order by payout_due_date asc
  loop
    update public.payout_schedule
    set status = 'pending',
        automatic_attempted_at = now(),
        payout_reference = coalesce(payout_reference, 'auto-payout-prep-' || substr(gen_random_uuid()::text, 1, 10)),
        updated_at = now()
    where id = payout_record.id;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      null,
      'automatic_payout_attempt',
      'payout_schedule',
      payout_record.id,
      'Automatic payout placeholder attempted. Hubtel payout API is not connected yet.',
      jsonb_build_object(
        'circle_id', payout_record.circle_id,
        'member_id', payout_record.member_id,
        'payout_amount', payout_record.payout_amount,
        'mode', 'placeholder'
      )
    );

    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

create or replace function public.audit_payout_schedule_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'payout_scheduled',
    'payout_schedule',
    new.id,
    'Payout schedule row created from susu rotation.',
    jsonb_build_object(
      'circle_id', new.circle_id,
      'member_id', new.member_id,
      'rotation_position', new.rotation_position,
      'payout_due_date', new.payout_due_date,
      'payout_amount', new.payout_amount
    )
  );

  return new;
end;
$$;

drop trigger if exists audit_payout_schedule_insert_trigger on public.payout_schedule;
create trigger audit_payout_schedule_insert_trigger
  after insert on public.payout_schedule
  for each row
  execute function public.audit_payout_schedule_insert();
