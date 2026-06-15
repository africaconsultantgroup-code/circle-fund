-- 0045_global_circle_limits.sql
-- Centralizes circle creation and participation limit checks.

alter table public.circle_members
  drop constraint if exists circle_members_status_check;

alter table public.circle_members
  add constraint circle_members_status_check
  check (status in ('pending', 'pending_capacity_review', 'approved', 'rejected', 'removed'));

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
    and cm.status in ('pending', 'pending_capacity_review', 'approved')
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
    and cm.status in ('pending', 'pending_capacity_review', 'approved')
    and c.status = 'active';
$$;

create or replace function public.circle_has_member_capacity(check_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.circles c
    where c.id = check_circle_id
      and (
        select count(*)
        from public.circle_members existing_members
        where existing_members.circle_id = check_circle_id
          and existing_members.status in ('approved', 'pending', 'pending_capacity_review')
      ) < least(c.max_members, 15)
  );
$$;

create or replace function public.circle_pending_member_count(check_circle_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.circle_members existing_members
  where existing_members.circle_id = check_circle_id
    and existing_members.status in ('pending', 'pending_capacity_review');
$$;

create or replace function public.can_create_circle(check_user_id uuid, log_block boolean default false)
returns table (
  can_create boolean,
  active_admin_count integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count integer;
  result_message text;
begin
  if auth.uid() is null or auth.uid() <> check_user_id then
    return query select false, 0, 'Please sign in before creating a circle.';
    return;
  end if;

  admin_count := public.user_active_circle_admin_count(check_user_id);

  if admin_count >= 2 then
    result_message := 'You can only administer 2 active susu groups at a time.';

    if log_block then
      insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
      values (
        check_user_id,
        'create_circle_blocked_admin_limit',
        'user',
        check_user_id,
        result_message,
        jsonb_build_object('active_admin_count', admin_count, 'limit', 2)
      );
    end if;

    return query select false, admin_count, result_message;
    return;
  end if;

  return query select true, admin_count, 'Circle creation allowed.';
end;
$$;

create or replace function public.can_join_circle(check_user_id uuid, check_circle_id uuid, log_review boolean default false)
returns table (
  can_join boolean,
  requires_capacity_review boolean,
  active_circle_count integer,
  message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  has_capacity boolean;
  existing_status text;
  result_message text;
begin
  if auth.uid() is null or auth.uid() <> check_user_id then
    return query select false, false, 0, 'Please sign in before joining a circle.';
    return;
  end if;

  select cm.status
  into existing_status
  from public.circle_members cm
  where cm.circle_id = check_circle_id
    and cm.user_id = check_user_id
  limit 1;

  if existing_status is not null then
    return query select false, false, public.user_active_circle_count(check_user_id), 'You are already a member of this circle.';
    return;
  end if;

  has_capacity := public.circle_has_member_capacity(check_circle_id);
  if not has_capacity then
    return query select false, false, public.user_active_circle_count(check_user_id), 'This circle already has the maximum 15 members.';
    return;
  end if;

  active_count := public.user_active_circle_count(check_user_id);

  if active_count >= 3 then
    result_message := 'You are already in 3 active susu groups. SikaCircle must review your capacity before approving another group.';

    if log_review then
      insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
      values (
        check_user_id,
        'join_requires_capacity_review',
        'circle',
        check_circle_id,
        result_message,
        jsonb_build_object('user_id', check_user_id, 'active_circle_count', active_count, 'limit', 3)
      );
    end if;

    return query select true, true, active_count, result_message;
    return;
  end if;

  return query select true, false, active_count, 'Join request allowed.';
end;
$$;

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
    new.status := 'pending_capacity_review';

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

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      new.user_id,
      'join_request_capacity_review_created',
      'circle_member',
      new.id,
      'Customer join request requires SikaCircle capacity review.',
      jsonb_build_object(
        'user_id', new.user_id,
        'circle_id', new.circle_id,
        'active_circle_count', public.user_active_circle_count(new.user_id),
        'capacity_review_status', new.capacity_review_status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists sync_capacity_review_member_after_insert_trigger on public.circle_members;
create trigger sync_capacity_review_member_after_insert_trigger
  after insert on public.circle_members
  for each row
  execute function public.sync_capacity_review_member_after_insert();
