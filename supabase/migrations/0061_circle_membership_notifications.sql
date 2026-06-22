-- 0061_circle_membership_notifications.sql
-- Adds durable membership workflow notifications for circle admins and applicants.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  membership_id uuid references public.circle_members(id) on delete cascade,
  type text not null check (type in ('join_request', 'membership_approved', 'membership_rejected')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_membership_type_user_idx
  on public.notifications (membership_id, type, user_id)
  where membership_id is not null;

alter table public.notifications enable row level security;

drop policy if exists "Notifications: users can read their own" on public.notifications;
create policy "Notifications: users can read their own"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "Notifications: users can mark their own as read" on public.notifications;
create policy "Notifications: users can mark their own as read"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notify_circle_admins_of_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  applicant_name text;
  circle_name text;
begin
  if new.status <> 'pending' or new.role = 'creator' then
    return new;
  end if;

  select coalesce(nullif(trim(p.full_name), ''), 'A new member')
  into applicant_name
  from public.profiles p
  where p.user_id = new.user_id;

  select c.name into circle_name
  from public.circles c
  where c.id = new.circle_id;

  insert into public.notifications (user_id, circle_id, membership_id, type, title, body)
  select admin_user_id, new.circle_id, new.id, 'join_request', 'Pending circle request',
    coalesce(applicant_name, 'A new member') || ' requested to join ' || coalesce(circle_name, 'your circle') || '.'
  from (
    select c.owner_id as admin_user_id
    from public.circles c
    where c.id = new.circle_id
    union
    select cm.user_id
    from public.circle_members cm
    where cm.circle_id = new.circle_id
      and cm.status = 'approved'
      and cm.role in ('creator', 'admin')
  ) admins
  where admin_user_id is not null
  on conflict (membership_id, type, user_id) where membership_id is not null do nothing;

  return new;
end;
$$;

drop trigger if exists notify_circle_admins_after_join_request on public.circle_members;
create trigger notify_circle_admins_after_join_request
  after insert on public.circle_members
  for each row execute function public.notify_circle_admins_of_join_request();

-- Surface requests that were already pending before this migration was applied.
insert into public.notifications (user_id, circle_id, membership_id, type, title, body, created_at)
select
  admins.admin_user_id,
  cm.circle_id,
  cm.id,
  'join_request',
  'Pending circle request',
  coalesce(nullif(trim(p.full_name), ''), 'A new member') || ' requested to join ' || c.name || '.',
  coalesce(cm.joined_at, cm.created_at, now())
from public.circle_members cm
join public.circles c on c.id = cm.circle_id
left join public.profiles p on p.user_id = cm.user_id
cross join lateral (
  select c.owner_id as admin_user_id
  union
  select circle_admin.user_id
  from public.circle_members circle_admin
  where circle_admin.circle_id = cm.circle_id
    and circle_admin.status = 'approved'
    and circle_admin.role in ('creator', 'admin')
) admins
where cm.status = 'pending'
  and cm.role <> 'creator'
  and admins.admin_user_id is not null
on conflict (membership_id, type, user_id) where membership_id is not null do nothing;

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
  select * into target_member from public.circle_members where id = check_membership_id;
  if target_member.id is null then raise exception 'Member request not found'; end if;

  select * into target_circle from public.circles where id = target_member.circle_id;
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
    next_status := 'approved'; audit_action := 'approve_circle_member';
  elsif action = 'reject' then
    next_status := 'rejected'; audit_action := 'reject_circle_member';
  elsif action = 'remove' then
    next_status := 'removed'; audit_action := 'remove_circle_member';
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
  values (auth.uid(), audit_action, 'circle_member', target_member.id, 'Circle admin managed a circle member.',
    jsonb_build_object('actor_role', actor_role, 'circle_id', target_member.circle_id,
      'member_user_id', target_member.user_id, 'new_status', target_member.status,
      'requires_capacity_review', target_member.requires_capacity_review,
      'capacity_review_status', target_member.capacity_review_status));

  if action in ('approve', 'reject') then
    update public.notifications
    set read_at = coalesce(read_at, now())
    where membership_id = target_member.id
      and type = 'join_request';

    insert into public.notifications (user_id, circle_id, membership_id, type, title, body)
    values (
      target_member.user_id,
      target_member.circle_id,
      target_member.id,
      case when action = 'approve' then 'membership_approved' else 'membership_rejected' end,
      case when action = 'approve' then 'Circle request approved' else 'Circle request declined' end,
      case when action = 'approve'
        then 'Your request to join ' || coalesce(target_circle.name, 'the circle') || ' was approved.'
        else 'Your request to join ' || coalesce(target_circle.name, 'the circle') || ' was declined.'
      end
    )
    on conflict (membership_id, type, user_id) where membership_id is not null do nothing;
  end if;

  return target_member;
end;
$$;
