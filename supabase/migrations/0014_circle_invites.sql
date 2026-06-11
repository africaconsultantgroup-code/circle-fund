-- 0014_circle_invites.sql
-- Adds invite links and max-member limits for circle creation and joining.

alter table public.circles
  add column if not exists max_members integer not null default 15,
  add column if not exists invite_token text;

update public.circles
set invite_token = upper(substr(replace(id::text, '-', ''), 1, 10))
where invite_token is null;

alter table public.circles
  alter column invite_token set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'circles_max_members_check'
  ) then
    alter table public.circles
      add constraint circles_max_members_check
      check (max_members between 2 and 15);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'circles_invite_token_key'
  ) then
    alter table public.circles
      add constraint circles_invite_token_key unique (invite_token);
  end if;
end $$;

create or replace function public.circle_has_member_capacity(check_circle_id uuid)
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
      and (
        select count(*)
        from public.circle_members existing_members
        where existing_members.circle_id = check_circle_id
          and existing_members.status in ('active', 'pending')
      ) < least(c.max_members, 15)
  );
$$;

drop policy if exists "Circles: authenticated users can select active invite previews" on public.circles;

create policy "Circles: authenticated users can select active invite previews"
  on public.circles
  as permissive
  for select
  using (
    auth.uid() is not null
    and status = 'active'
  );
