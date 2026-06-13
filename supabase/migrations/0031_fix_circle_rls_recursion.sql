-- 0031_fix_circle_rls_recursion.sql
-- Removes direct cross-table RLS checks between circles and circle_members.
-- Cross-table membership/admin checks live in SECURITY DEFINER helpers instead.

create or replace function public.user_has_circle_membership(check_circle_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = check_circle_id
      and cm.user_id = check_user_id
      and cm.status in ('pending', 'approved', 'rejected')
  );
$$;

create or replace function public.is_circle_admin(check_circle_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.circles c
    where c.id = check_circle_id
      and c.owner_id = check_user_id
  )
  or exists (
    select 1
    from public.circle_members cm
    where cm.circle_id = check_circle_id
      and cm.user_id = check_user_id
      and cm.status = 'approved'
      and cm.role in ('creator', 'admin')
  );
$$;

create or replace function public.is_approved_circle_member(check_circle_id uuid, check_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.is_circle_admin(check_circle_id, check_user_id)
    or exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = check_circle_id
        and cm.user_id = check_user_id
        and cm.status = 'approved'
    );
$$;

drop policy if exists "Circles: owners can manage their circles" on public.circles;
drop policy if exists "Circles: authenticated users can insert circles" on public.circles;
drop policy if exists "Circles: owners can select their circles" on public.circles;
drop policy if exists "Circles: owners can update their circles" on public.circles;
drop policy if exists "Circles: owners can delete their circles" on public.circles;
drop policy if exists "Circles: members can select their circles" on public.circles;
drop policy if exists "Circles: authenticated users can select active invite previews" on public.circles;
drop policy if exists "Circles: eligible users can insert circles" on public.circles;

create policy "Circles: owners can select their circles"
  on public.circles
  as permissive
  for select
  using (auth.uid() = owner_id);

create policy "Circles: members can select their circles"
  on public.circles
  as permissive
  for select
  using (public.user_has_circle_membership(id, auth.uid()));

create policy "Circles: authenticated users can select active invite previews"
  on public.circles
  as permissive
  for select
  using (auth.uid() is not null and status = 'active');

create policy "Circles: eligible users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (
    auth.uid() = owner_id
    and public.user_passes_circle_onboarding(auth.uid())
  );

create policy "Circles: owners can update their circles"
  on public.circles
  as permissive
  for update
  using (auth.uid() = owner_id)
  with check (auth.uid() = owner_id);

create policy "Circles: owners can delete their circles"
  on public.circles
  as permissive
  for delete
  using (auth.uid() = owner_id);

drop policy if exists "Circle members: users can select their own membership" on public.circle_members;
drop policy if exists "Circle owners: can select membership in owned circles" on public.circle_members;
drop policy if exists "Circle members: users can insert their own membership" on public.circle_members;
drop policy if exists "Circle owners: can manage membership in owned circles" on public.circle_members;
drop policy if exists "Circle members: users can update their own membership status" on public.circle_members;
drop policy if exists "Circle members: eligible users can insert their own membership" on public.circle_members;
drop policy if exists "Circle members: admins can select all circle members" on public.circle_members;
drop policy if exists "Circle members: approved members can select approved peers" on public.circle_members;
drop policy if exists "Circle members: admins can manage circle members" on public.circle_members;

create policy "Circle members: users can select their own rows"
  on public.circle_members
  as permissive
  for select
  using (auth.uid() = user_id);

create policy "Circle members: admins can select all circle members"
  on public.circle_members
  as permissive
  for select
  using (public.is_circle_admin(circle_id, auth.uid()));

create policy "Circle members: approved members can select approved peers"
  on public.circle_members
  as permissive
  for select
  using (
    status = 'approved'
    and public.is_approved_circle_member(circle_id, auth.uid())
  );

create policy "Circle members: eligible users can insert their own membership"
  on public.circle_members
  as permissive
  for insert
  with check (
    auth.uid() = user_id
    and public.user_passes_circle_onboarding(auth.uid())
    and public.circle_has_member_capacity(circle_id)
  );

create policy "Circle members: admins can manage circle members"
  on public.circle_members
  as permissive
  for update
  using (public.is_circle_admin(circle_id, auth.uid()))
  with check (public.is_circle_admin(circle_id, auth.uid()));

create policy "Circle members: users can update their own membership status"
  on public.circle_members
  as permissive
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
