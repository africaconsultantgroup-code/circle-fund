-- 0008_user_verifications.sql
-- Prepares official Ghana Card, phone OTP, and face verification integration.

create table if not exists public.user_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  ghana_card_number_hash text,
  phone_verified boolean not null default false,
  ghana_card_verified boolean not null default false,
  face_verified boolean not null default false,
  selfie_uploaded boolean not null default false,
  verification_provider text,
  provider_reference text,
  verification_status text not null default 'not_started',
  failure_reason text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_verifications_status_check
    check (verification_status in ('not_started', 'pending', 'verified', 'failed', 'manual_review'))
);

alter table public.user_verifications enable row level security;

drop policy if exists "User verifications: users can select their own verification" on public.user_verifications;

create policy "User verifications: users can select their own verification"
  on public.user_verifications
  as permissive
  for select
  using (auth.uid() = user_id);

create or replace function public.create_verification_for_new_user()
returns trigger as $$
begin
  insert into public.user_verifications (user_id, created_at, updated_at)
  values (new.id, now(), now())
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists create_verification_after_auth_user_insert on auth.users;

create trigger create_verification_after_auth_user_insert
  after insert on auth.users
  for each row
  execute function public.create_verification_for_new_user();

insert into public.user_verifications (user_id, created_at, updated_at)
select p.user_id, now(), now()
from public.profiles p
on conflict (user_id) do nothing;

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
      and uv.ghana_card_verified is true
      and uv.face_verified is true
      and uv.phone_verified is true
      and uv.verification_status = 'verified'
      and p.profile_completed is true
      and p.account_status = 'active'
  );
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
