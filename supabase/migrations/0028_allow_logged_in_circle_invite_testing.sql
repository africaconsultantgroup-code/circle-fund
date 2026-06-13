-- 0028_allow_logged_in_circle_invite_testing.sql
-- Temporarily allow authenticated users to create and join circles while
-- verification status sync is being fixed. Auth ownership and capacity checks
-- remain enforced by RLS and helper RPCs.

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

alter table public.circles
  add column if not exists invite_code text;

update public.circles
set invite_code = coalesce(invite_code, invite_token)
where invite_code is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'circles_invite_code_key'
  ) then
    alter table public.circles
      add constraint circles_invite_code_key unique (invite_code);
  end if;
end $$;

drop policy if exists "Circles: eligible users can insert circles" on public.circles;

create policy "Circles: eligible users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (
    auth.uid() = owner_id
    and public.user_passes_circle_onboarding(auth.uid())
  );

drop policy if exists "Circle members: eligible users can insert their own membership" on public.circle_members;

create policy "Circle members: eligible users can insert their own membership"
  on public.circle_members
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_passes_circle_onboarding(auth.uid())
    and public.circle_has_member_capacity(circle_id)
  );

create or replace function public.circle_member_count(check_circle_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(*)::integer
  from public.circle_members existing_members
  where existing_members.circle_id = check_circle_id
    and existing_members.status in ('active', 'pending');
$$;
