-- 0033_admin_roles_permissions_audit_logs.sql
-- Adds staff roles, staff authorization helpers, and audit logging for admin actions.

alter table public.profiles
  drop constraint if exists profiles_role_check;

update public.profiles
set role = 'super_admin',
    updated_at = now()
where role = 'admin';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin', 'operations', 'compliance', 'finance', 'support', 'customer'));

create or replace function public.current_user_staff_role()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select p.role
  from public.profiles p
  where p.user_id = auth.uid()
    and p.account_status = 'active'
    and p.role in ('super_admin', 'operations', 'compliance', 'finance', 'support')
  limit 1;
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.current_user_staff_role() is not null;
$$;

create or replace function public.bootstrap_current_user_admin()
returns table (
  user_id uuid,
  email text,
  role text,
  account_status text,
  promoted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  existing_profile public.profiles;
begin
  select lower(au.email)
  into current_email
  from auth.users au
  where au.id = auth.uid();

  if current_email is null then
    raise exception 'No authenticated user email found';
  end if;

  if not exists (
    select 1
    from public.admin_bootstrap_emails abe
    where lower(abe.email) = current_email
  ) then
    raise exception 'Email is not allowed to bootstrap admin access';
  end if;

  insert into public.profiles (
    user_id,
    full_name,
    role,
    account_status,
    profile_completed,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    'SikaCircle Admin',
    'super_admin',
    'active',
    true,
    now(),
    now()
  )
  on conflict (user_id) do update
  set role = 'super_admin',
      account_status = 'active',
      profile_completed = true,
      updated_at = now()
  returning * into existing_profile;

  return query
  select existing_profile.user_id, current_email, existing_profile.role, existing_profile.account_status, true;
end;
$$;

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

create index if not exists audit_logs_staff_user_id_idx on public.audit_logs (staff_user_id);
create index if not exists audit_logs_target_idx on public.audit_logs (target_type, target_id);
create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

drop policy if exists "Audit logs: staff can select" on public.audit_logs;
create policy "Audit logs: staff can select"
  on public.audit_logs
  as permissive
  for select
  using (public.current_user_staff_role() is not null);

drop policy if exists "Audit logs: staff can insert" on public.audit_logs;
create policy "Audit logs: staff can insert"
  on public.audit_logs
  as permissive
  for insert
  with check (public.current_user_staff_role() is not null and staff_user_id = auth.uid());

create or replace function public.record_staff_audit_log(
  action text,
  target_type text,
  target_id uuid,
  notes text default null,
  metadata jsonb default '{}'::jsonb
)
returns public.audit_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  created_log public.audit_logs;
begin
  staff_role := public.current_user_staff_role();

  if staff_role is null then
    raise exception 'Staff access required to write audit logs';
  end if;

  insert into public.audit_logs (
    staff_user_id,
    action,
    target_type,
    target_id,
    notes,
    metadata
  )
  values (
    auth.uid(),
    action,
    target_type,
    target_id,
    notes,
    coalesce(metadata, '{}'::jsonb) || jsonb_build_object('staff_role', staff_role)
  )
  returning * into created_log;

  return created_log;
end;
$$;

create or replace function public.audit_profile_staff_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  action_name text;
begin
  staff_role := public.current_user_staff_role();

  if staff_role is null then
    return new;
  end if;

  if old.account_status is distinct from new.account_status then
    action_name := case
      when new.account_status in ('suspended', 'disabled') then 'suspend_user'
      when new.account_status = 'active' then 'reactivate_user'
      else 'update_user_account_status'
    end;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      action_name,
      'profile',
      new.user_id,
      'Staff changed user account status.',
      jsonb_build_object(
        'staff_role', staff_role,
        'old_account_status', old.account_status,
        'new_account_status', new.account_status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_profile_staff_changes_trigger on public.profiles;
create trigger audit_profile_staff_changes_trigger
  after update on public.profiles
  for each row
  execute function public.audit_profile_staff_changes();

create or replace function public.audit_verification_staff_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  action_name text;
begin
  staff_role := public.current_user_staff_role();

  if staff_role is null then
    return new;
  end if;

  if old.verification_status is distinct from new.verification_status
    and new.verification_status in ('verified', 'failed') then
    action_name := case
      when new.verification_status = 'verified' then 'approve_verification'
      else 'reject_verification'
    end;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      action_name,
      'user_verification',
      new.user_id,
      'Staff changed user verification status.',
      jsonb_build_object(
        'staff_role', staff_role,
        'old_verification_status', old.verification_status,
        'new_verification_status', new.verification_status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_verification_staff_changes_trigger on public.user_verifications;
create trigger audit_verification_staff_changes_trigger
  after update on public.user_verifications
  for each row
  execute function public.audit_verification_staff_changes();

create or replace function public.audit_circle_staff_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  action_name text;
begin
  staff_role := public.current_user_staff_role();

  if staff_role is null then
    return new;
  end if;

  if old.status is distinct from new.status then
    action_name := case
      when new.status = 'paused' then 'freeze_circle'
      when new.status in ('completed', 'cancelled') then 'close_circle'
      else 'update_circle_status'
    end;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      action_name,
      'circle',
      new.id,
      'Staff changed circle status.',
      jsonb_build_object(
        'staff_role', staff_role,
        'old_status', old.status,
        'new_status', new.status
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_circle_staff_changes_trigger on public.circles;
create trigger audit_circle_staff_changes_trigger
  after update on public.circles
  for each row
  execute function public.audit_circle_staff_changes();

create or replace function public.audit_payout_staff_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_role text;
  action_name text;
begin
  staff_role := public.current_user_staff_role();

  if staff_role is null then
    return new;
  end if;

  if old.status is distinct from new.status then
    action_name := case
      when new.status = 'completed' then 'approve_payout'
      when new.status = 'pending' then 'hold_payout'
      when new.status = 'failed' then 'retry_payout'
      else 'update_payout_status'
    end;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      action_name,
      'payout',
      new.id,
      'Staff changed payout status.',
      jsonb_build_object(
        'staff_role', staff_role,
        'old_status', old.status::text,
        'new_status', new.status::text
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists audit_payout_staff_changes_trigger on public.payouts;
create trigger audit_payout_staff_changes_trigger
  after update on public.payouts
  for each row
  execute function public.audit_payout_staff_changes();

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

  if public.current_user_staff_role() is not null then
    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      audit_action,
      'circle_member',
      target_member.id,
      'Staff managed a circle member.',
      jsonb_build_object(
        'circle_id', target_member.circle_id,
        'member_user_id', target_member.user_id,
        'new_status', target_member.status
      )
    );
  end if;

  return target_member;
end;
$$;
