-- 0023_allow_verified_status_for_circle_gate.sql
-- Treat an approved user_verifications row as sufficient for circle access.

create or replace function public.user_passes_circle_onboarding(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and auth.uid() = check_user_id
    and exists (
      select 1
      from public.user_verifications uv
      left join public.profiles p on p.user_id = uv.user_id
      where uv.user_id = check_user_id
        and (
          (
            uv.verification_status = 'verified'
            and uv.phone_verified is true
            and uv.otp_status = 'verified'
          )
          or (
            p.profile_completed is true
            and p.account_status = 'active'
            and uv.phone_verified is true
            and uv.otp_status = 'verified'
            and (
              uv.ghana_card_verified is true
              or (
                nullif(trim(coalesce(uv.ghana_card_number_hash, '')), '') is not null
                and coalesce(uv.ghana_card_status, uv.verification_status) in ('pending', 'manual_review', 'verified')
              )
            )
            and (
              uv.face_verified is true
              or (
                uv.selfie_uploaded is true
                and coalesce(uv.face_status, uv.verification_status) in ('pending', 'manual_review', 'verified')
              )
            )
          )
        )
    );
$$;
