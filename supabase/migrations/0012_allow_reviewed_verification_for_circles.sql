-- 0012_allow_reviewed_verification_for_circles.sql
-- Allows circle access after required submissions are accepted for manual/admin review.

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
      and (
        uv.ghana_card_verified is true
        or (
          nullif(trim(coalesce(uv.ghana_card_number_hash, '')), '') is not null
          and uv.verification_status in ('pending', 'manual_review', 'verified')
        )
      )
      and (
        uv.face_verified is true
        or (
          uv.selfie_uploaded is true
          and uv.verification_status in ('pending', 'manual_review', 'verified')
        )
      )
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
