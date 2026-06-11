-- 0010_ensure_user_verification_columns.sql
-- Makes the verification table safe for projects where 0008 ran after the table already existed.

alter table public.user_verifications
  add column if not exists ghana_card_number_hash text,
  add column if not exists phone_verified boolean not null default false,
  add column if not exists ghana_card_verified boolean not null default false,
  add column if not exists face_verified boolean not null default false,
  add column if not exists selfie_uploaded boolean not null default false,
  add column if not exists verification_provider text,
  add column if not exists provider_reference text,
  add column if not exists verification_status text not null default 'not_started',
  add column if not exists failure_reason text,
  add column if not exists verified_at timestamptz,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_verifications_status_check'
  ) then
    alter table public.user_verifications
      add constraint user_verifications_status_check
      check (verification_status in ('not_started', 'pending', 'verified', 'failed', 'manual_review'));
  end if;
end $$;
