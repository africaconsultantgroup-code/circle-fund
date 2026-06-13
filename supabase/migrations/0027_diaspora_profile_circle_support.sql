-- 0027_diaspora_profile_circle_support.sql
-- Add diaspora profile metadata and circle base currency support.

alter table public.profiles
  add column if not exists country text,
  add column if not exists preferred_currency text not null default 'GHS',
  add column if not exists expected_monthly_contribution numeric(12, 2);

alter table public.circles
  add column if not exists base_currency text not null default 'GHS';

update public.profiles
set preferred_currency = coalesce(nullif(preferred_currency, ''), 'GHS'),
    country = coalesce(nullif(country, ''), 'Ghana')
where preferred_currency is null
   or preferred_currency = ''
   or country is null
   or country = '';

update public.circles
set base_currency = coalesce(nullif(base_currency, ''), 'GHS')
where base_currency is null
   or base_currency = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_preferred_currency_check'
  ) then
    alter table public.profiles
      add constraint profiles_preferred_currency_check
      check (preferred_currency in ('GHS', 'GBP', 'USD', 'EUR'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'circles_base_currency_check'
  ) then
    alter table public.circles
      add constraint circles_base_currency_check
      check (base_currency in ('GHS', 'GBP', 'USD', 'EUR'));
  end if;
end $$;
