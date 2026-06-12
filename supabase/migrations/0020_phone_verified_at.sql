-- 0020_phone_verified_at.sql
-- Keeps an explicit phone verification timestamp alongside the OTP timestamp.

alter table public.user_verifications
  add column if not exists phone_verified_at timestamptz;

update public.user_verifications
set phone_verified_at = coalesce(phone_verified_at, otp_verified_at, verified_at, updated_at)
where phone_verified is true
  and phone_verified_at is null;
