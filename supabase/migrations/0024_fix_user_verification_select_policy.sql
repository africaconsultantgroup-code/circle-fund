-- 0024_fix_user_verification_select_policy.sql
-- Ensures signed-in users can read their own verification state.

alter table public.user_verifications enable row level security;

grant select on table public.user_verifications to authenticated;

drop policy if exists "User verifications: users can select their own verification" on public.user_verifications;
drop policy if exists "User verifications: authenticated users can select own row" on public.user_verifications;

create policy "User verifications: authenticated users can select own row"
  on public.user_verifications
  as permissive
  for select
  to authenticated
  using (user_id = auth.uid());
