-- 0038_diaspora_otp_test_mode.sql
-- Flags diaspora OTP preview verifications so they can be excluded from real money movement later.

alter table public.user_verifications
  add column if not exists is_test_verification boolean not null default false;

update public.user_verifications
set is_test_verification = true
where verification_provider in ('diaspora_test_otp', 'sandbox_international_otp')
  and phone_verified is true;

create or replace function public.user_can_access_money_movement(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_verifications uv
    where uv.user_id = check_user_id
      and uv.phone_verified is true
      and uv.otp_status = 'verified'
      and coalesce(uv.is_test_verification, false) is false
  );
$$;
