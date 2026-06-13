-- 0030_circle_access_lookup.sql
-- Provides an access-aware circle lookup so the frontend can distinguish a
-- missing circle from one hidden by access rules.

create or replace function public.get_circle_access(check_circle_id uuid)
returns table (
  found boolean,
  access_granted boolean,
  id uuid,
  owner_id uuid,
  name text,
  description text,
  contribution_amount numeric,
  base_currency text,
  frequency text,
  max_members integer,
  invite_code text,
  invite_token text,
  start_date timestamptz,
  status public.circle_status
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  target_circle public.circles;
  can_access boolean;
begin
  select *
  into target_circle
  from public.circles c
  where c.id = check_circle_id;

  if target_circle.id is null then
    return query select false, false, null::uuid, null::uuid, null::text, null::text, null::numeric, null::text, null::text, null::integer, null::text, null::text, null::timestamptz, null::public.circle_status;
    return;
  end if;

  can_access := target_circle.owner_id = auth.uid()
    or exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = check_circle_id
        and cm.user_id = auth.uid()
        and cm.status in ('pending', 'approved', 'rejected')
    );

  if not can_access then
    return query select true, false, target_circle.id, target_circle.owner_id, null::text, null::text, null::numeric, null::text, null::text, null::integer, null::text, null::text, null::timestamptz, null::public.circle_status;
    return;
  end if;

  return query select
    true,
    true,
    target_circle.id,
    target_circle.owner_id,
    target_circle.name,
    target_circle.description,
    target_circle.contribution_amount,
    target_circle.base_currency,
    target_circle.frequency,
    target_circle.max_members,
    target_circle.invite_code,
    target_circle.invite_token,
    target_circle.start_date,
    target_circle.status;
end;
$$;

drop policy if exists "Circles: owners can select their circles" on public.circles;
create policy "Circles: owners can select their circles"
  on public.circles
  as permissive
  for select
  using (auth.uid() = owner_id);

drop policy if exists "Circles: members can select their circles" on public.circles;
create policy "Circles: members can select their circles"
  on public.circles
  as permissive
  for select
  using (
    exists (
      select 1
      from public.circle_members cm
      where cm.circle_id = id
        and cm.user_id = auth.uid()
        and cm.status in ('pending', 'approved', 'rejected')
    )
  );

drop policy if exists "Circle members: admins can select all circle members" on public.circle_members;
create policy "Circle members: admins can select all circle members"
  on public.circle_members
  as permissive
  for select
  using (public.is_circle_admin(circle_id, auth.uid()));

drop policy if exists "Circle members: approved members can select approved peers" on public.circle_members;
create policy "Circle members: approved members can select approved peers"
  on public.circle_members
  as permissive
  for select
  using (
    status = 'approved'
    and public.is_approved_circle_member(circle_id, auth.uid())
  );
