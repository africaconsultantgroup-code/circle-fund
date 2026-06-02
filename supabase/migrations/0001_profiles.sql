-- 0001_profiles.sql
-- Creates the profiles table and auto-creates a profile for every new auth user.

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles: users can select their own profile"
  on public.profiles
  as permissive
  for select
  using (auth.uid() = user_id);

create policy "Profiles: users can insert their own profile"
  on public.profiles
  as permissive
  for insert
  with check (auth.uid() = user_id);

create policy "Profiles: users can update their own profile"
  on public.profiles
  as permissive
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Auto-create profile record for newly registered auth users.
create or replace function public.create_profile_for_new_user()
returns trigger as $$
begin
  insert into public.profiles (user_id, created_at, updated_at)
  values (new.id, now(), now())
  on conflict (user_id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger create_profile_after_auth_user_insert
  after insert on auth.users
  for each row
  execute function public.create_profile_for_new_user();
