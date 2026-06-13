-- 0029_circle_member_approval_tracking.sql
-- Adds live member approval metadata, member-management RPCs, and contribution
-- tracking structure without creating fake payment rows.

alter table public.circle_members
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);

update public.circle_members
set status = 'approved',
    approved_at = coalesce(approved_at, joined_at),
    approved_by = coalesce(approved_by, invited_by, user_id)
where status = 'active';

update public.circle_members
set status = 'pending'
where status not in ('pending', 'approved', 'rejected', 'removed');

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'circle_members_status_check'
  ) then
    alter table public.circle_members
      add constraint circle_members_status_check
      check (status in ('pending', 'approved', 'rejected', 'removed'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'circle_members_role_check'
  ) then
    alter table public.circle_members
      add constraint circle_members_role_check
      check (role in ('creator', 'admin', 'member'));
  end if;
end $$;

alter table public.contributions
  add column if not exists due_date timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text;

alter type public.contribution_status add value if not exists 'unpaid';
alter type public.contribution_status add value if not exists 'paid';
alter type public.contribution_status add value if not exists 'late';

create or replace function public.is_circle_admin(check_circle_id uuid, check_user_id uuid)
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
      and c.owner_id = check_user_id
  )
  or exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = check_circle_id
      and cm.user_id = check_user_id
      and cm.status = 'approved'
      and cm.role in ('creator', 'admin')
  );
$$;

create or replace function public.is_approved_circle_member(check_circle_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_circle_admin(check_circle_id, check_user_id)
    or exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = check_circle_id
        and cm.user_id = check_user_id
        and cm.status = 'approved'
    );
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
          and existing_members.status in ('approved', 'pending')
      ) < least(c.max_members, 15)
  );
$$;

create or replace function public.circle_member_count(check_circle_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.circle_members existing_members
  where existing_members.circle_id = check_circle_id
    and existing_members.status = 'approved';
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
    and existing_members.status = 'pending';
$$;

create or replace function public.get_circle_members(check_circle_id uuid)
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
  preferred_currency text
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
    p.preferred_currency
  from public.circle_members cm
  left join public.profiles p on p.user_id = cm.user_id
  where cm.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or (
        public.is_approved_circle_member(check_circle_id, auth.uid())
        and cm.status = 'approved'
      )
      or cm.user_id = auth.uid()
    )
  order by
    case cm.status
      when 'pending' then 1
      when 'approved' then 2
      when 'rejected' then 3
      else 4
    end,
    cm.joined_at asc;
$$;

create or replace function public.manage_circle_member(check_membership_id uuid, action text)
returns public.circle_members
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.circle_members;
  next_status text;
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
  elsif action = 'reject' then
    next_status := 'rejected';
  elsif action = 'remove' then
    next_status := 'removed';
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
    c.status::text,
    c.paid_at,
    coalesce(c.payment_reference, c.reference)
  from public.contributions c
  left join public.profiles p on p.user_id = c.user_id
  where c.circle_id = check_circle_id
    and public.is_circle_admin(check_circle_id, auth.uid())
  order by coalesce(c.due_date, c.contribution_date) asc;
$$;

drop policy if exists "Circles: members can select their circles" on public.circles;
create policy "Circles: members can select their circles"
  on public.circles
  as permissive
  for select
  using (
    exists (
      select 1 from public.circle_members cm
      where cm.circle_id = id
        and cm.user_id = auth.uid()
        and cm.status in ('pending', 'approved', 'rejected')
    )
  );

drop policy if exists "Circle members: approved members can select approved peers" on public.circle_members;
create policy "Circle members: approved members can select approved peers"
  on public.circle_members
  as permissive
  for select
  using (
    status = 'approved'
    and public.is_approved_circle_member(circle_id, auth.uid())
  );

drop policy if exists "Circle members: admins can manage circle members" on public.circle_members;
create policy "Circle members: admins can manage circle members"
  on public.circle_members
  as permissive
  for update
  using (public.is_circle_admin(circle_id, auth.uid()))
  with check (public.is_circle_admin(circle_id, auth.uid()));
