-- 0017_allow_logged_in_circle_testing.sql
-- Temporarily allows authenticated users to create and join circles while the
-- verification-status bug is paused. RLS still requires auth.uid() to match the
-- inserted owner/member row, and capacity checks remain active.

create or replace function public.user_passes_circle_onboarding(check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select auth.uid() is not null
    and auth.uid() = check_user_id;
$$;
