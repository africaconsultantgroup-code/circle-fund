-- 0046_fix_circle_limit_rpcs.sql
-- Recreates circle limit RPCs with stable signatures for the customer app.

drop function if exists public.can_create_circle(uuid, boolean);
drop function if exists public.can_join_circle(uuid, uuid, boolean);

create or replace function public.can_create_circle(check_user_id uuid, log_block boolean default false)
returns table (
  can_create boolean,
  active_admin_count integer,
  max_admin_circles integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count integer := 0;
  max_count integer := 2;
  blocked_reason text := 'You can only administer 2 active susu groups at a time.';
begin
  if auth.uid() is null or auth.uid() <> check_user_id then
    return query select false, 0, max_count, 'Please sign in before creating a circle.';
    return;
  end if;

  select count(distinct active_admin_circles.circle_id)::integer
  into admin_count
  from (
    select c.id as circle_id
    from public.circles c
    where c.owner_id = check_user_id
      and c.status = 'active'

    union

    select cm.circle_id
    from public.circle_members cm
    join public.circles c on c.id = cm.circle_id
    where cm.user_id = check_user_id
      and cm.role in ('creator', 'admin')
      and cm.status = 'approved'
      and c.status = 'active'
  ) active_admin_circles;

  if admin_count >= max_count then
    if log_block then
      insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
      values (
        check_user_id,
        'create_circle_blocked_admin_limit',
        'user',
        check_user_id,
        blocked_reason,
        jsonb_build_object('active_admin_count', admin_count, 'max_admin_circles', max_count)
      );
    end if;

    return query select false, admin_count, max_count, blocked_reason;
    return;
  end if;

  return query select true, admin_count, max_count, 'Circle creation allowed.';
end;
$$;

create or replace function public.can_join_circle(check_user_id uuid, check_circle_id uuid, log_block boolean default false)
returns table (
  can_join boolean,
  requires_capacity_review boolean,
  active_circle_count integer,
  max_circles_without_review integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer := 0;
  max_count integer := 3;
  has_capacity boolean;
  existing_status text;
  review_reason text := 'You are already in 3 active susu groups. SikaCircle must review your capacity before approving another group.';
begin
  if auth.uid() is null or auth.uid() <> check_user_id then
    return query select false, false, 0, max_count, 'Please sign in before joining a circle.';
    return;
  end if;

  select cm.status
  into existing_status
  from public.circle_members cm
  where cm.circle_id = check_circle_id
    and cm.user_id = check_user_id
  limit 1;

  if existing_status is not null then
    return query select false, false, public.user_active_circle_count(check_user_id), max_count, 'You are already a member of this circle.';
    return;
  end if;

  has_capacity := public.circle_has_member_capacity(check_circle_id);
  if not has_capacity then
    return query select false, false, public.user_active_circle_count(check_user_id), max_count, 'This circle already has the maximum 15 members.';
    return;
  end if;

  select count(distinct active_memberships.circle_id)::integer
  into active_count
  from (
    select c.id as circle_id
    from public.circles c
    where c.owner_id = check_user_id
      and c.status = 'active'

    union

    select cm.circle_id
    from public.circle_members cm
    join public.circles c on c.id = cm.circle_id
    where cm.user_id = check_user_id
      and cm.status = 'approved'
      and cm.role in ('creator', 'admin', 'member')
      and c.status = 'active'
  ) active_memberships;

  if active_count >= max_count then
    if log_block then
      insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
      values (
        check_user_id,
        'join_requires_capacity_review',
        'circle',
        check_circle_id,
        review_reason,
        jsonb_build_object(
          'user_id', check_user_id,
          'active_circle_count', active_count,
          'max_circles_without_review', max_count
        )
      );
    end if;

    return query select true, true, active_count, max_count, review_reason;
    return;
  end if;

  return query select true, false, active_count, max_count, 'Join request allowed.';
end;
$$;

notify pgrst, 'reload schema';
