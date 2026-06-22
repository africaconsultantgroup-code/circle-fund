-- 0062_fix_payout_rotation_eligibility.sql
-- Initial payout generation is available to circle admins once 2 members are approved.

create or replace function public.generate_circle_payout_rotation(check_circle_id uuid, regenerate boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
  approved_count integer := 0;
  existing_count integer := 0;
  inserted_count integer := 0;
  rotation_locked boolean := false;
begin
  select *
  into target_circle
  from public.circles
  where id = check_circle_id;

  if target_circle.id is null then
    raise exception 'Circle not found';
  end if;

  if not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only circle admins can generate payout rotation';
  end if;

  select count(*)
  into approved_count
  from public.circle_members cm
  where cm.circle_id = check_circle_id
    and cm.status = 'approved';

  if approved_count < 2 then
    raise exception 'Approve at least 2 members before generating payout rotation';
  end if;

  select count(*), coalesce(bool_or(locked_at is not null), false)
  into existing_count, rotation_locked
  from public.payout_schedule
  where circle_id = check_circle_id;

  if existing_count > 0 and rotation_locked then
    raise exception 'Payout rotation is locked and cannot be regenerated';
  end if;

  if existing_count > 0 and not regenerate then
    return 0;
  end if;

  if regenerate and coalesce(target_circle.start_date, now()) <= now() then
    raise exception 'Payout rotation can only be regenerated before the circle starts';
  end if;

  if existing_count > 0 and regenerate then
    delete from public.payout_schedule
    where circle_id = check_circle_id;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      'regenerate_payout_rotation',
      'circle',
      check_circle_id,
      'Circle admin regenerated payout rotation before the circle started.',
      jsonb_build_object(
        'circle_id', check_circle_id,
        'approved_member_count', approved_count,
        'frequency', target_circle.frequency,
        'start_date', target_circle.start_date
      )
    );
  else
    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      'generate_payout_rotation',
      'circle',
      check_circle_id,
      'Circle admin generated payout rotation.',
      jsonb_build_object(
        'circle_id', check_circle_id,
        'approved_member_count', approved_count,
        'frequency', target_circle.frequency,
        'start_date', target_circle.start_date
      )
    );
  end if;

  with shuffled_members as (
    select
      cm.id as member_id,
      row_number() over (order by gen_random_uuid())::integer as rotation_position
    from public.circle_members cm
    where cm.circle_id = check_circle_id
      and cm.status = 'approved'
  ),
  inserted as (
    insert into public.payout_schedule (
      circle_id,
      member_id,
      rotation_position,
      payout_due_date,
      payout_amount,
      status,
      created_at,
      updated_at
    )
    select
      check_circle_id,
      sm.member_id,
      sm.rotation_position,
      public.next_circle_due_date(
        coalesce(target_circle.start_date, now()),
        target_circle.frequency,
        sm.rotation_position - 1
      ),
      coalesce(target_circle.contribution_amount, 0) * approved_count,
      'scheduled',
      now(),
      now()
    from shuffled_members sm
    returning 1
  )
  select count(*) into inserted_count from inserted;

  perform public.generate_circle_contribution_schedule(check_circle_id, approved_count);

  return inserted_count;
end;
$$;
