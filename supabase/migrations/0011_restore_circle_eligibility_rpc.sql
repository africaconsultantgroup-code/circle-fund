-- 0011_restore_circle_eligibility_rpc.sql
-- Restores the RPC and RLS checks that gate circle creation/joining after verification.

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
      and uv.phone_verified is true
      and uv.ghana_card_verified is true
      and uv.face_verified is true
      and p.profile_completed is true
      and p.account_status = 'active'
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

drop policy if exists "Circles: eligible users can insert circles" on public.circles;

create policy "Circles: eligible users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (
    auth.uid() = owner_id
    and public.user_passes_circle_onboarding(auth.uid())
  );

drop policy if exists "Circle members: eligible users can insert their own membership" on public.circle_members;

create policy "Circle members: eligible users can insert their own membership"
  on public.circle_members
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_passes_circle_onboarding(auth.uid())
    and public.circle_has_member_capacity(circle_id)
  );
