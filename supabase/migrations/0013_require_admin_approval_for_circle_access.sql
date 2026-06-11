-- 0013_require_admin_approval_for_circle_access.sql
-- Keeps Create/Join protected until verification is admin/provider approved.

create or replace function public.user_passes_circle_onboarding(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    join public.user_verifications uv on uv.user_id = p.user_id
    where p.user_id = check_user_id
      and p.profile_completed is true
      and p.account_status = 'active'
      and uv.phone_verified is true
      and uv.ghana_card_verified is true
      and uv.face_verified is true
      and uv.verification_status = 'verified'
  );
$$;

create or replace function public.circle_has_member_capacity(check_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select (
    select count(*)
    from public.circle_members existing_members
    where existing_members.circle_id = check_circle_id
      and existing_members.status in ('active', 'pending')
  ) < 15;
$$;
