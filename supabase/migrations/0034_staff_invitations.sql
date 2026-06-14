-- 0034_staff_invitations.sql
-- Staff invitations let super admins pre-authorize admin access for an email.
-- Staff still sign up through the normal customer auth flow; the profile insert
-- matches the invited email and assigns the selected staff role.

create table if not exists public.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('super_admin', 'operations', 'compliance', 'finance', 'support')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'cancelled')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_user_id uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists staff_invitations_pending_email_idx
  on public.staff_invitations (lower(email))
  where status = 'pending';

create index if not exists staff_invitations_status_idx on public.staff_invitations (status, invited_at desc);

alter table public.staff_invitations enable row level security;

drop policy if exists "Staff invitations: staff can select" on public.staff_invitations;
create policy "Staff invitations: staff can select"
  on public.staff_invitations
  as permissive
  for select
  using (public.current_user_staff_role() is not null);

drop policy if exists "Staff invitations: super admins can manage" on public.staff_invitations;
create policy "Staff invitations: super admins can manage"
  on public.staff_invitations
  as permissive
  for all
  using (public.current_user_staff_role() = 'super_admin')
  with check (public.current_user_staff_role() = 'super_admin');

create or replace function public.apply_pending_staff_invitation_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  auth_email text;
  invitation public.staff_invitations;
begin
  select lower(au.email)
  into auth_email
  from auth.users au
  where au.id = new.user_id;

  if auth_email is null then
    return new;
  end if;

  select *
  into invitation
  from public.staff_invitations si
  where lower(si.email) = auth_email
    and si.status = 'pending'
  order by si.invited_at desc
  limit 1;

  if invitation.id is null then
    return new;
  end if;

  new.role := invitation.role;
  new.account_status := 'active';

  update public.staff_invitations
  set status = 'accepted',
      accepted_user_id = new.user_id,
      accepted_at = now(),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('accepted_from', 'profile_signup')
  where id = invitation.id;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    invitation.invited_by,
    'accept_staff_invitation',
    'profile',
    new.user_id,
    'Staff invitation matched a new signup and assigned role.',
    jsonb_build_object(
      'email', auth_email,
      'role', invitation.role,
      'invitation_id', invitation.id
    )
  );

  return new;
end;
$$;

drop trigger if exists apply_pending_staff_invitation_to_profile_trigger on public.profiles;
create trigger apply_pending_staff_invitation_to_profile_trigger
  before insert on public.profiles
  for each row
  execute function public.apply_pending_staff_invitation_to_profile();
