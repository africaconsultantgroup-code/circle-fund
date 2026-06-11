-- 0015_verification_step_status_sync.sql
-- Adds explicit per-step submission status fields so customer UI and admin gating
-- read the same verification state after provider placeholders submit records.

alter table public.user_verifications
  add column if not exists ghana_card_status text not null default 'not_started',
  add column if not exists face_status text not null default 'not_started';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_verifications_ghana_card_status_check'
  ) then
    alter table public.user_verifications
      add constraint user_verifications_ghana_card_status_check
      check (ghana_card_status in ('not_started', 'pending', 'verified', 'failed', 'manual_review'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_verifications_face_status_check'
  ) then
    alter table public.user_verifications
      add constraint user_verifications_face_status_check
      check (face_status in ('not_started', 'pending', 'verified', 'failed', 'manual_review'));
  end if;
end $$;

update public.user_verifications
set ghana_card_status = case
    when ghana_card_verified is true then 'verified'
    when verification_status = 'failed' and nullif(trim(coalesce(ghana_card_number_hash, '')), '') is not null then 'failed'
    when nullif(trim(coalesce(ghana_card_number_hash, '')), '') is not null then 'pending'
    else 'not_started'
  end,
  face_status = case
    when face_verified is true then 'verified'
    when verification_status = 'failed' and selfie_uploaded is true then 'failed'
    when selfie_uploaded is true then 'manual_review'
    else 'not_started'
  end,
  updated_at = now()
where ghana_card_status = 'not_started'
   or face_status = 'not_started';

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
