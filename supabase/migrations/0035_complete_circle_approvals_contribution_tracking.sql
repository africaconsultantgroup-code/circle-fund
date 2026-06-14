-- 0035_complete_circle_approvals_contribution_tracking.sql
-- Finalizes live circle approval audit logging and contribution status display.

alter type public.contribution_status add value if not exists 'overdue';

create or replace function public.manage_circle_member(check_membership_id uuid, action text)
returns public.circle_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.circle_members;
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

  if not public.is_circle_admin(target_member.circle_id, auth.uid()) then
    raise exception 'Only circle admins can manage members';
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
      'new_status', target_member.status
    )
  );

  return target_member;
end;
$$;

create or replace function public.get_circle_contribution_status(check_circle_id uuid)
returns table (
  contribution_id uuid,
  user_id uuid,
  full_name text,
  expected_amount numeric,
  due_date timestamptz,
  status text,
  paid_at timestamptz,
  payment_reference text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.user_id,
    p.full_name,
    c.amount,
    c.due_date,
    case
      when c.status::text in ('paid', 'processed') then 'paid'
      when c.status::text = 'failed' then 'failed'
      when c.due_date is not null
        and c.due_date < now()
        and c.status::text in ('pending', 'unpaid') then 'overdue'
      when c.status::text in ('pending', 'unpaid') then 'unpaid'
      when c.status::text = 'late' then 'overdue'
      else c.status::text
    end as status,
    c.paid_at,
    coalesce(c.payment_reference, c.reference)
  from public.contributions c
  left join public.profiles p on p.user_id = c.user_id
  where c.circle_id = check_circle_id
    and public.is_circle_admin(check_circle_id, auth.uid())
  order by coalesce(c.due_date, c.contribution_date) asc;
$$;
