-- 0047_remove_email_member_display_fallback.sql
-- Customer member displays must not expose emails or phone numbers.

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
        public.safe_profile_name(p.name)
      )
      from public.profiles p
      where p.user_id = profile_user_id
      limit 1
    ),
    'Member'
  );
$$;

notify pgrst, 'reload schema';
