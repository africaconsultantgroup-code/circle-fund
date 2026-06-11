-- 0016_normalize_verification_status_rows.sql
-- Keeps aggregate and per-step verification status fields synchronized even when
-- steps are submitted in different orders or retried after approval.

create or replace function public.normalize_user_verification_row()
returns trigger
language plpgsql
as $$
begin
  if new.ghana_card_verified is true then
    new.ghana_card_status := 'verified';
  elsif nullif(trim(coalesce(new.ghana_card_number_hash, '')), '') is not null
    and coalesce(new.ghana_card_status, 'not_started') = 'not_started' then
    new.ghana_card_status := 'pending';
  end if;

  if new.face_verified is true then
    new.face_status := 'verified';
  elsif new.selfie_uploaded is true
    and coalesce(new.face_status, 'not_started') = 'not_started' then
    new.face_status := 'manual_review';
  end if;

  if new.phone_verified is true
    and new.ghana_card_verified is true
    and new.face_verified is true then
    new.verification_status := 'verified';
    new.verified_at := coalesce(new.verified_at, now());
  elsif new.verification_status = 'verified' then
    new.verification_status := 'manual_review';
    new.verified_at := null;
  elsif new.verification_status = 'not_started'
    and (
      new.phone_verified is true
      or nullif(trim(coalesce(new.ghana_card_number_hash, '')), '') is not null
      or new.selfie_uploaded is true
    ) then
    new.verification_status := 'pending';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists normalize_user_verification_before_write on public.user_verifications;

create trigger normalize_user_verification_before_write
  before insert or update on public.user_verifications
  for each row
  execute function public.normalize_user_verification_row();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'phone_otp_verification_status'
  ) then
    execute $sql$
      update public.user_verifications uv
      set phone_verified = true,
        updated_at = now()
      from public.profiles p
      where p.user_id = uv.user_id
        and p.phone_otp_verification_status = 'verified'
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'ghana_card_verification_status'
  ) then
    execute $sql$
      update public.user_verifications uv
      set ghana_card_verified = case
          when p.ghana_card_verification_status = 'verified' then true
          else uv.ghana_card_verified
        end,
        ghana_card_status = case
          when p.ghana_card_verification_status = 'verified' then 'verified'
          when p.ghana_card_verification_status = 'pending' then 'pending'
          when p.ghana_card_verification_status = 'rejected' then 'failed'
          else uv.ghana_card_status
        end,
        updated_at = now()
      from public.profiles p
      where p.user_id = uv.user_id
    $sql$;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'selfie_image_url'
  ) then
    execute $sql$
      update public.user_verifications uv
      set selfie_uploaded = true,
        face_status = case
          when uv.face_status = 'not_started' then 'manual_review'
          else uv.face_status
        end,
        updated_at = now()
      from public.profiles p
      where p.user_id = uv.user_id
        and nullif(trim(coalesce(p.selfie_image_url, '')), '') is not null
    $sql$;
  end if;
end $$;

update public.user_verifications
set updated_at = now();
