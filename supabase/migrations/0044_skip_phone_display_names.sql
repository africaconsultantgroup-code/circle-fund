-- 0044_skip_phone_display_names.sql
-- Prevents phone-like values from being used as customer-facing member names.

create or replace function public.safe_profile_name(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null then null
    when nullif(trim(value), '') is null then null
    when regexp_replace(value, '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$' then null
    else trim(value)
  end;
$$;

create or replace function public.profile_display_name(profile_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select coalesce(
        public.safe_profile_name(p.full_name),
        public.safe_profile_name(p.name),
        nullif(trim(p.email), '')
      )
      from public.profiles p
      where p.user_id = profile_user_id
      limit 1
    ),
    'Member'
  );
$$;
