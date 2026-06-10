-- 0007_onboarding_eligibility.sql
-- Adds onboarding eligibility fields and enforces create/join checks in RLS.

alter table public.profiles
  add column if not exists ghana_card_verification_status text not null default 'unverified',
  add column if not exists phone_otp_verification_status text not null default 'unverified',
  add column if not exists selfie_image_url text,
  add column if not exists profile_completed boolean not null default false,
  add column if not exists account_status text not null default 'active';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_ghana_card_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_ghana_card_verification_status_check
      check (ghana_card_verification_status in ('unverified', 'pending', 'verified', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_phone_otp_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_phone_otp_verification_status_check
      check (phone_otp_verification_status in ('unverified', 'pending', 'verified', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_account_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_account_status_check
      check (account_status in ('active', 'pending', 'suspended', 'disabled'));
  end if;
end $$;

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
    where p.user_id = check_user_id
      and p.ghana_card_verification_status = 'verified'
      and p.phone_otp_verification_status = 'verified'
      and nullif(trim(coalesce(p.selfie_image_url, p.avatar_url, '')), '') is not null
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

drop policy if exists "Circles: authenticated users can insert circles" on public.circles;
drop policy if exists "Circles: owners can manage their circles" on public.circles;
drop policy if exists "Circles: owners can select their circles" on public.circles;
drop policy if exists "Circles: owners can update their circles" on public.circles;
drop policy if exists "Circles: owners can delete their circles" on public.circles;
drop policy if exists "Circles: eligible users can insert circles" on public.circles;

create policy "Circles: owners can select their circles"
  on public.circles
  as permissive
  for select
  using (auth.uid() = owner_id);

create policy "Circles: owners can update their circles"
  on public.circles
  as permissive
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Circles: owners can delete their circles"
  on public.circles
  as permissive
  for delete
  using (auth.uid() = owner_id);

create policy "Circles: eligible users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (
    auth.uid() = owner_id
    and public.user_passes_circle_onboarding(auth.uid())
  );

drop policy if exists "Circle members: users can insert their own membership" on public.circle_members;
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
