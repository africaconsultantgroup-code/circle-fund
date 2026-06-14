-- 0032_admin_bootstrap_emails.sql
-- Safe admin bootstrap: only explicitly allowlisted auth emails can promote
-- their own profile to admin. Admin authorization remains sourced from
-- public.profiles.role for auth.uid().

create table if not exists public.admin_bootstrap_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.admin_bootstrap_emails enable row level security;

insert into public.admin_bootstrap_emails (email)
values ('eadavoh@gmail.com')
on conflict (email) do nothing;

create or replace function public.bootstrap_current_user_admin()
returns table (
  user_id uuid,
  email text,
  role text,
  account_status text,
  promoted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  existing_profile public.profiles;
begin
  select lower(au.email)
  into current_email
  from auth.users au
  where au.id = auth.uid();

  if current_email is null then
    raise exception 'No authenticated user email found';
  end if;

  if not exists (
    select 1
    from public.admin_bootstrap_emails abe
    where lower(abe.email) = current_email
  ) then
    raise exception 'Email is not allowed to bootstrap admin access';
  end if;

  insert into public.profiles (
    user_id,
    full_name,
    role,
    account_status,
    profile_completed,
    created_at,
    updated_at
  )
  values (
    auth.uid(),
    'SikaCircle Admin',
    'admin',
    'active',
    true,
    now(),
    now()
  )
  on conflict (user_id) do update
  set role = 'admin',
      account_status = 'active',
      profile_completed = true,
      updated_at = now()
  returning * into existing_profile;

  return query
  select existing_profile.user_id, current_email, existing_profile.role, existing_profile.account_status, true;
end;
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
      and p.account_status = 'active'
  );
$$;

drop policy if exists "Admin bootstrap emails: admins can select" on public.admin_bootstrap_emails;
create policy "Admin bootstrap emails: admins can select"
  on public.admin_bootstrap_emails
  as permissive
  for select
  using (public.current_user_is_admin());

drop policy if exists "Admin bootstrap emails: admins can manage" on public.admin_bootstrap_emails;
create policy "Admin bootstrap emails: admins can manage"
  on public.admin_bootstrap_emails
  as permissive
  for all
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());
