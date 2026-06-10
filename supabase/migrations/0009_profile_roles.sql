-- 0009_profile_roles.sql
-- Adds application roles for separating customer and admin deployments.

alter table public.profiles
  add column if not exists role text not null default 'customer';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_role_check'
  ) then
    alter table public.profiles
      add constraint profiles_role_check
      check (role in ('customer', 'admin'));
  end if;
end $$;

create or replace function public.prevent_user_profile_privilege_escalation()
returns trigger as $$
begin
  if auth.role() <> 'service_role' then
    if new.role is distinct from old.role then
      raise exception 'Users cannot change their own role.';
    end if;

    if new.account_status is distinct from old.account_status then
      raise exception 'Users cannot change their own account status.';
    end if;
  end if;

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists prevent_user_profile_privilege_escalation_trigger on public.profiles;

create trigger prevent_user_profile_privilege_escalation_trigger
  before update on public.profiles
  for each row
  execute function public.prevent_user_profile_privilege_escalation();

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
