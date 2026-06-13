-- 0022_fix_otp_verification_storage_table.sql
-- Keeps phone OTP state in user_verifications, not profiles.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'otp_status') then
    create type public.otp_status as enum ('not_started', 'pending', 'verified', 'failed');
  end if;
end $$;

alter table public.user_verifications
  add column if not exists phone_number text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists otp_status public.otp_status not null default 'not_started',
  add column if not exists otp_reference text,
  add column if not exists otp_verified_at timestamptz,
  add column if not exists otp_code_hash text,
  add column if not exists otp_expires_at timestamptz;

alter table public.profiles
  drop column if exists phone_otp_verification_status;
