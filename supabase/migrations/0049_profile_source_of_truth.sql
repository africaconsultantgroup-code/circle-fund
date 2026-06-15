-- 0049_profile_source_of_truth.sql
-- Keeps public.profiles as the single user profile source of truth.

alter table public.profiles
  add column if not exists name text,
  add column if not exists email text,
  add column if not exists country text,
  add column if not exists preferred_currency text not null default 'GHS',
  add column if not exists expected_monthly_contribution numeric,
  add column if not exists profile_completed boolean not null default false,
  add column if not exists account_status text not null default 'active',
  add column if not exists role text not null default 'customer';

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  metadata_name text := nullif(trim(coalesce(metadata->>'full_name', metadata->>'name', '')), '');
  metadata_phone text := nullif(trim(coalesce(metadata->>'phone', '')), '');
  metadata_country text := nullif(trim(coalesce(metadata->>'country', '')), '');
  metadata_currency text := nullif(trim(coalesce(metadata->>'preferred_currency', '')), '');
  metadata_expected numeric := null;
begin
  if coalesce(metadata->>'expected_monthly_contribution', '') ~ '^[0-9]+(\.[0-9]+)?$' then
    metadata_expected := (metadata->>'expected_monthly_contribution')::numeric;
  end if;

  insert into public.profiles (
    user_id,
    full_name,
    name,
    email,
    phone,
    country,
    preferred_currency,
    expected_monthly_contribution,
    profile_completed,
    account_status,
    role,
    created_at,
    updated_at
  )
  values (
    new.id,
    metadata_name,
    metadata_name,
    new.email,
    metadata_phone,
    metadata_country,
    coalesce(metadata_currency, 'GHS'),
    metadata_expected,
    metadata_name is not null and metadata_phone is not null and metadata_country is not null,
    'active',
    'customer',
    now(),
    now()
  )
  on conflict (user_id) do update
    set
      full_name = coalesce(nullif(trim(public.profiles.full_name), ''), excluded.full_name),
      name = coalesce(nullif(trim(public.profiles.name), ''), excluded.name),
      email = coalesce(nullif(trim(public.profiles.email), ''), excluded.email),
      phone = coalesce(nullif(trim(public.profiles.phone), ''), excluded.phone),
      country = coalesce(nullif(trim(public.profiles.country), ''), excluded.country),
      preferred_currency = coalesce(nullif(trim(public.profiles.preferred_currency), ''), excluded.preferred_currency, 'GHS'),
      expected_monthly_contribution = coalesce(public.profiles.expected_monthly_contribution, excluded.expected_monthly_contribution),
      profile_completed = public.profiles.profile_completed
        or (excluded.full_name is not null and excluded.phone is not null and excluded.country is not null),
      account_status = coalesce(nullif(trim(public.profiles.account_status), ''), 'active'),
      role = coalesce(nullif(trim(public.profiles.role), ''), 'customer'),
      updated_at = now();

  return new;
end;
$$;

update public.profiles p
set
  full_name = coalesce(nullif(trim(p.full_name), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')), '')),
  name = coalesce(nullif(trim(p.name), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')), '')),
  email = coalesce(nullif(trim(p.email), ''), au.email),
  phone = coalesce(nullif(trim(p.phone), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'phone', '')), '')),
  country = coalesce(nullif(trim(p.country), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'country', '')), '')),
  preferred_currency = coalesce(nullif(trim(p.preferred_currency), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'preferred_currency', '')), ''), 'GHS'),
  expected_monthly_contribution = coalesce(
    p.expected_monthly_contribution,
    case
      when coalesce(au.raw_user_meta_data->>'expected_monthly_contribution', '') ~ '^[0-9]+(\.[0-9]+)?$'
      then (au.raw_user_meta_data->>'expected_monthly_contribution')::numeric
      else null
    end
  ),
  profile_completed = p.profile_completed
    or (
      coalesce(nullif(trim(p.full_name), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'full_name', au.raw_user_meta_data->>'name', '')), '')) is not null
      and coalesce(nullif(trim(p.phone), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'phone', '')), '')) is not null
      and coalesce(nullif(trim(p.country), ''), nullif(trim(coalesce(au.raw_user_meta_data->>'country', '')), '')) is not null
    ),
  updated_at = now()
from auth.users au
where au.id = p.user_id
  and (
    nullif(trim(p.full_name), '') is null
    or nullif(trim(p.name), '') is null
    or nullif(trim(p.email), '') is null
    or nullif(trim(p.phone), '') is null
    or nullif(trim(p.country), '') is null
    or p.profile_completed is false
  );

notify pgrst, 'reload schema';
