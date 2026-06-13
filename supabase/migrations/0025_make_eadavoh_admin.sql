-- 0025_make_eadavoh_admin.sql
-- Ensures the primary admin account is recognized by admin Edge Functions.

insert into public.profiles (
  user_id,
  full_name,
  role,
  account_status,
  profile_completed,
  created_at,
  updated_at
)
select
  au.id,
  coalesce(au.raw_user_meta_data->>'full_name', 'SikaCircle Admin'),
  'admin',
  'active',
  true,
  now(),
  now()
from auth.users au
where lower(au.email) = 'eadavoh@gmail.com'
on conflict (user_id) do update
set role = 'admin',
  account_status = 'active',
  profile_completed = true,
  updated_at = now();
