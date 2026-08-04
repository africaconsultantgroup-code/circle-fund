-- Forward-only reconciliation for known production gaps.
-- Deploy and validate this before Automation (0066) and Protection (0067).

-- Phone-first signup still requires exactly one verification bootstrap row.
create or replace function public.create_verification_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_verifications (user_id, created_at, updated_at)
  values (new.id, now(), now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists create_verification_after_auth_user_insert on auth.users;
create trigger create_verification_after_auth_user_insert
  after insert on auth.users
  for each row execute function public.create_verification_for_new_user();

insert into public.user_verifications (user_id, created_at, updated_at)
select p.user_id, now(), now()
from public.profiles p
where not exists (
  select 1 from public.user_verifications uv where uv.user_id = p.user_id
)
on conflict (user_id) do nothing;

revoke all on function public.create_verification_for_new_user()
  from public, anon, authenticated;

-- Customers may edit profile content, but not authorization fields.
create or replace function public.prevent_customer_profile_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin')
    and (
      new.role is distinct from old.role
      or new.account_status is distinct from old.account_status
    )
  then
    raise exception 'Protected profile authorization fields cannot be changed directly';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_user_profile_privilege_escalation_trigger on public.profiles;
drop trigger if exists prevent_customer_profile_privilege_escalation_trigger on public.profiles;
create trigger prevent_customer_profile_privilege_escalation_trigger
  before update on public.profiles
  for each row execute function public.prevent_customer_profile_privilege_escalation();

revoke all on function public.prevent_customer_profile_privilege_escalation()
  from public, anon, authenticated;

-- Lock payout terms after the Circle starts or receives confirmed funds.
create or replace function public.circle_rotation_is_locked(check_circle_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.circles c
    where c.id = check_circle_id
      and c.start_date is not null
      and c.start_date <= now()
  ) or exists (
    select 1 from public.contributions c
    where c.circle_id = check_circle_id
      and c.status::text in ('paid', 'processed')
  ) or exists (
    select 1 from public.payment_transactions pt
    where pt.circle_id = check_circle_id
      and pt.status = 'successful'
  );
$$;

create or replace function public.protect_started_circle_rotation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  target_circle_id uuid := case when tg_op = 'DELETE' then old.circle_id else new.circle_id end;
begin
  if public.circle_rotation_is_locked(target_circle_id) then
    if tg_op = 'INSERT' then
      raise exception 'Payout schedules cannot be added after a Circle starts or receives funds';
    elsif tg_op = 'DELETE' then
      raise exception 'Payout schedules cannot be deleted after a Circle starts or receives funds';
    elsif row(new.circle_id, new.member_id, new.rotation_position, new.payout_due_date, new.payout_amount)
      is distinct from
      row(old.circle_id, old.member_id, old.rotation_position, old.payout_due_date, old.payout_amount)
    then
      raise exception 'Beneficiary, payout position, date, and amount are locked after a Circle starts or receives funds';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists protect_started_circle_rotation_trigger on public.payout_schedule;
create trigger protect_started_circle_rotation_trigger
  before insert or update or delete on public.payout_schedule
  for each row execute function public.protect_started_circle_rotation();

create or replace function public.lock_started_circle_rotations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_count integer := 0;
begin
  update public.payout_schedule ps
  set locked_at = coalesce(ps.locked_at, now()),
      updated_at = now()
  where ps.locked_at is null
    and public.circle_rotation_is_locked(ps.circle_id);
  get diagnostics locked_count = row_count;
  return locked_count;
end;
$$;

revoke all on function public.circle_rotation_is_locked(uuid) from public, anon, authenticated;
revoke all on function public.protect_started_circle_rotation() from public, anon, authenticated;
revoke all on function public.lock_started_circle_rotations() from public, anon, authenticated;
grant execute on function public.lock_started_circle_rotations() to service_role;

-- Customer-facing names never fall back to phone-like values or email.
create or replace function public.safe_profile_name(value text)
returns text
language sql
immutable
as $$
  select case
    when value is null or nullif(trim(value), '') is null then null
    when value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then null
    when regexp_replace(value, '[^0-9]', '', 'g') ~ '^[0-9]{7,15}$' then null
    else trim(value)
  end;
$$;

create or replace function public.profile_display_name(profile_user_id uuid)
returns text
language sql
security definer
stable
set search_path = public
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

grant execute on function public.profile_display_name(uuid) to authenticated;

-- Durable, provider-independent notification foundation.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  circle_id uuid references public.circles(id) on delete cascade,
  membership_id uuid references public.circle_members(id) on delete cascade,
  type text not null check (type in ('join_request', 'membership_approved', 'membership_rejected')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create unique index if not exists notifications_membership_type_user_idx
  on public.notifications (membership_id, type, user_id)
  where membership_id is not null;

alter table public.notifications enable row level security;
drop policy if exists "Notifications: users can read their own" on public.notifications;
create policy "Notifications: users can read their own"
  on public.notifications for select using (user_id = auth.uid());
drop policy if exists "Notifications: users can mark their own as read" on public.notifications;

revoke all on table public.notifications from anon;
revoke insert, update, delete on table public.notifications from authenticated;
grant select on table public.notifications to authenticated;

create or replace function public.mark_notification_read(check_notification_id uuid)
returns public.notifications
language plpgsql
security definer
set search_path = public
as $$
declare
  target_notification public.notifications;
begin
  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.id = check_notification_id and n.user_id = auth.uid()
  returning n.* into target_notification;
  if target_notification.id is null then raise exception 'Notification not found'; end if;
  return target_notification;
end;
$$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;

create or replace function public.notify_circle_admins_of_join_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  applicant_name text := public.profile_display_name(new.user_id);
  circle_name text;
begin
  if new.status <> 'pending' or new.role = 'creator' then return new; end if;
  select c.name into circle_name from public.circles c where c.id = new.circle_id;
  insert into public.notifications (user_id, circle_id, membership_id, type, title, body)
  select admins.admin_user_id, new.circle_id, new.id, 'join_request',
    'Pending circle request',
    applicant_name || ' requested to join ' || coalesce(circle_name, 'your circle') || '.'
  from (
    select c.owner_id as admin_user_id from public.circles c where c.id = new.circle_id
    union
    select cm.user_id from public.circle_members cm
    where cm.circle_id = new.circle_id
      and cm.status = 'approved'
      and cm.role in ('creator', 'admin')
  ) admins
  where admins.admin_user_id is not null
  on conflict (membership_id, type, user_id)
    where membership_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists notify_circle_admins_after_join_request on public.circle_members;
create trigger notify_circle_admins_after_join_request
  after insert on public.circle_members
  for each row execute function public.notify_circle_admins_of_join_request();

create or replace function public.notify_membership_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  circle_name text;
begin
  if old.status is not distinct from new.status
    or new.status not in ('approved', 'rejected')
  then
    return new;
  end if;
  select c.name into circle_name from public.circles c where c.id = new.circle_id;
  update public.notifications n
  set read_at = coalesce(n.read_at, now())
  where n.membership_id = new.id and n.type = 'join_request';
  insert into public.notifications (user_id, circle_id, membership_id, type, title, body)
  values (
    new.user_id, new.circle_id, new.id,
    case when new.status = 'approved' then 'membership_approved' else 'membership_rejected' end,
    case when new.status = 'approved' then 'Circle request approved' else 'Circle request declined' end,
    case when new.status = 'approved'
      then 'Your request to join ' || coalesce(circle_name, 'the circle') || ' was approved.'
      else 'Your request to join ' || coalesce(circle_name, 'the circle') || ' was declined.'
    end
  )
  on conflict (membership_id, type, user_id)
    where membership_id is not null do nothing;
  return new;
end;
$$;

drop trigger if exists notify_membership_after_status_change on public.circle_members;
create trigger notify_membership_after_status_change
  after update of status on public.circle_members
  for each row execute function public.notify_membership_status_change();

insert into public.notifications (user_id, circle_id, membership_id, type, title, body, created_at)
select
  admins.admin_user_id, cm.circle_id, cm.id, 'join_request', 'Pending circle request',
  public.profile_display_name(cm.user_id) || ' requested to join ' || c.name || '.',
  coalesce(cm.joined_at, cm.created_at, now())
from public.circle_members cm
join public.circles c on c.id = cm.circle_id
cross join lateral (
  select c.owner_id as admin_user_id
  union
  select ca.user_id from public.circle_members ca
  where ca.circle_id = cm.circle_id
    and ca.status = 'approved'
    and ca.role in ('creator', 'admin')
) admins
where cm.status = 'pending'
  and cm.role <> 'creator'
  and admins.admin_user_id is not null
on conflict (membership_id, type, user_id)
  where membership_id is not null do nothing;

-- Fix current lint errors by removing ambiguous identifiers.
create or replace function public.bootstrap_current_user_admin()
returns table (user_id uuid, email text, role text, account_status text, promoted boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_email text;
  existing_profile public.profiles;
begin
  select lower(au.email) into current_email
  from auth.users au where au.id = auth.uid();
  if current_email is null then raise exception 'No authenticated user email found'; end if;
  if not exists (
    select 1 from public.admin_bootstrap_emails abe
    where lower(abe.email) = current_email
  ) then
    raise exception 'Email is not allowed to bootstrap admin access';
  end if;
  insert into public.profiles as target (
    user_id, full_name, role, account_status, profile_completed, created_at, updated_at
  )
  values (auth.uid(), 'SikaCircle Admin', 'super_admin', 'active', true, now(), now())
  on conflict on constraint profiles_user_id_key do update
  set role = 'super_admin',
      account_status = 'active',
      profile_completed = true,
      updated_at = now()
  returning target.* into existing_profile;
  return query
  select existing_profile.user_id, current_email, existing_profile.role,
    existing_profile.account_status, true;
end;
$$;

create or replace function public.admin_find_hubtel_payment(check_provider_reference text)
returns table (
  id uuid, user_id uuid, circle_id uuid, contribution_id uuid, amount numeric,
  currency text, payment_method text, provider text, provider_reference text,
  status text, payment_type text, provider_response jsonb, created_at timestamptz,
  updated_at timestamptz, user_name text, user_email text, circle_name text,
  wallet_transaction_id uuid, wallet_status text, receipt_id text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  staff_profile public.profiles;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select p.* into staff_profile from public.profiles p where p.user_id = auth.uid();
  if staff_profile.user_id is null
    or staff_profile.account_status <> 'active'
    or staff_profile.role not in ('super_admin', 'finance')
  then
    raise exception 'Finance or Super Admin access required';
  end if;
  if nullif(trim(check_provider_reference), '') is null then
    raise exception 'Provider reference is required';
  end if;
  return query
  select
    pt.id, pt.user_id, pt.circle_id, pt.contribution_id, pt.amount, pt.currency,
    pt.payment_method, pt.provider, pt.provider_reference, pt.status, pt.payment_type,
    pt.provider_response, pt.created_at, pt.updated_at,
    coalesce(nullif(trim(p.full_name), ''), nullif(trim(p.name), ''), nullif(trim(p.email), '')),
    p.email, c.name, wt.id, wt.status, wt.receipt_id
  from public.payment_transactions pt
  left join public.profiles p on p.user_id = pt.user_id
  left join public.circles c on c.id = pt.circle_id
  left join public.wallet_transactions wt on wt.payment_transaction_id = pt.id
  where pt.provider = 'hubtel'
    and pt.provider_reference = trim(check_provider_reference)
  order by pt.created_at desc
  limit 1;
end;
$$;

-- SQL avoids PL/pgSQL output-column shadowing in the access lookup.
create or replace function public.get_circle_access(check_circle_id uuid)
returns table (
  found boolean, access_granted boolean, id uuid, owner_id uuid, name text,
  description text, contribution_amount numeric, base_currency text, frequency text,
  max_members integer, invite_code text, invite_token text, start_date timestamptz,
  status public.circle_status
)
language sql
security definer
stable
set search_path = public
as $$
  with target as (
    select c.*,
      c.owner_id = auth.uid() or exists (
        select 1 from public.circle_members cm
        where cm.circle_id = c.id
          and cm.user_id = auth.uid()
          and cm.status in ('pending', 'approved', 'rejected')
      ) as can_access
    from public.circles c where c.id = check_circle_id
  )
  select
    true, t.can_access, t.id, t.owner_id,
    case when t.can_access then t.name else null end,
    case when t.can_access then t.description else null end,
    case when t.can_access then t.contribution_amount else null end,
    case when t.can_access then t.base_currency else null end,
    case when t.can_access then t.frequency else null end,
    case when t.can_access then t.max_members else null end,
    case when t.can_access then t.invite_code else null end,
    case when t.can_access then t.invite_token else null end,
    case when t.can_access then t.start_date else null end,
    case when t.can_access then t.status else null end
  from target t
  union all
  select false, false, null::uuid, null::uuid, null::text, null::text,
    null::numeric, null::text, null::text, null::integer, null::text, null::text,
    null::timestamptz, null::public.circle_status
  where not exists (select 1 from target);
$$;

-- Remove the contribution scheduler's shadowed loop variable without changing behavior.
create or replace function public.generate_circle_contribution_schedule(
  check_circle_id uuid,
  periods integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
  member_record public.circle_members;
  due_at timestamptz;
  inserted_count integer := 0;
  affected_count integer := 0;
begin
  select c.* into target_circle
  from public.circles c where c.id = check_circle_id;
  if target_circle.id is null then raise exception 'Circle not found'; end if;
  if auth.uid() is not null and not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only circle admins can generate contribution schedules';
  end if;
  for member_record in
    select cm.* from public.circle_members cm
    where cm.circle_id = check_circle_id and cm.status = 'approved'
  loop
    for schedule_period_index in 0..greatest(periods, 1) - 1 loop
      due_at := public.next_circle_due_date(
        coalesce(target_circle.start_date, now()),
        target_circle.frequency,
        schedule_period_index
      );
      insert into public.contributions (
        circle_id, member_id, user_id, amount, amount_due, contribution_date,
        due_date, status, created_at, updated_at
      )
      values (
        check_circle_id, member_record.id, member_record.user_id,
        coalesce(target_circle.contribution_amount, 0),
        coalesce(target_circle.contribution_amount, 0),
        due_at, due_at, 'pending', now(), now()
      )
      on conflict (circle_id, member_id, due_date)
        where member_id is not null and due_date is not null do nothing;
      get diagnostics affected_count = row_count;
      inserted_count := inserted_count + affected_count;
    end loop;
  end loop;
  return inserted_count;
end;
$$;

-- Testing-only financial mutation is not a production interface.
drop function if exists public.mark_contribution_paid_for_testing(uuid, text);

notify pgrst, 'reload schema';
