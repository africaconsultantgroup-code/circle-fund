-- 0074_test_account_controls.sql
-- Isolates named internal test accounts without weakening normal customer limits
-- or allowing financial history to be deleted.

create table if not exists public.app_test_accounts (
  user_id uuid primary key references auth.users(id) on delete restrict,
  reason text not null,
  max_admin_circles integer not null default 25
    check (max_admin_circles between 2 and 100),
  max_circle_participation integer not null default 25
    check (max_circle_participation between 3 and 100),
  allow_test_cleanup boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_test_accounts enable row level security;

drop policy if exists "Test accounts: staff can view" on public.app_test_accounts;
create policy "Test accounts: staff can view"
  on public.app_test_accounts for select
  using (public.current_user_staff_role() is not null);

insert into public.app_test_accounts(
  user_id, reason, max_admin_circles, max_circle_participation
)
select au.id, 'Internal Circle lifecycle and payment testing', 25, 25
from auth.users au
where lower(au.email) = 'eadavoh@gmail.com'
on conflict (user_id) do update set
  reason = excluded.reason,
  max_admin_circles = excluded.max_admin_circles,
  max_circle_participation = excluded.max_circle_participation,
  allow_test_cleanup = true,
  updated_at = now();

create or replace function public.is_app_test_account(check_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.app_test_accounts ata
    where ata.user_id = check_user_id
  );
$$;

create or replace function public.circle_admin_limit(check_user_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select ata.max_admin_circles
     from public.app_test_accounts ata
     where ata.user_id = check_user_id),
    2
  );
$$;

create or replace function public.circle_participation_limit(check_user_id uuid)
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select ata.max_circle_participation
     from public.app_test_accounts ata
     where ata.user_id = check_user_id),
    3
  );
$$;

drop policy if exists "Circles: eligible users can insert circles" on public.circles;
create policy "Circles: eligible users can insert circles"
  on public.circles
  as permissive
  for insert
  with check (
    auth.uid() = owner_id
    and public.user_passes_circle_onboarding(auth.uid())
    and public.user_active_circle_admin_count(auth.uid())
      < public.circle_admin_limit(auth.uid())
  );

create or replace function public.can_create_circle(
  check_user_id uuid,
  log_block boolean default false
)
returns table (
  can_create boolean,
  active_admin_count integer,
  max_admin_circles integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count integer := 0;
  max_count integer;
  blocked_reason text;
begin
  max_count := public.circle_admin_limit(check_user_id);
  blocked_reason := format(
    'You can only administer %s active susu groups at a time.', max_count
  );

  if auth.uid() is null or auth.uid() <> check_user_id then
    return query select false, 0, max_count,
      'Please sign in before creating a circle.';
    return;
  end if;

  admin_count := public.user_active_circle_admin_count(check_user_id);

  if admin_count >= max_count then
    if log_block then
      insert into public.audit_logs(
        staff_user_id, action, target_type, target_id, notes, metadata
      ) values (
        check_user_id, 'create_circle_blocked_admin_limit', 'user',
        check_user_id, blocked_reason,
        jsonb_build_object(
          'active_admin_count', admin_count,
          'max_admin_circles', max_count,
          'test_account', public.is_app_test_account(check_user_id)
        )
      );
    end if;
    return query select false, admin_count, max_count, blocked_reason;
    return;
  end if;

  return query select true, admin_count, max_count,
    case when public.is_app_test_account(check_user_id)
      then 'Test account Circle creation allowed.'
      else 'Circle creation allowed.'
    end;
end;
$$;

create or replace function public.can_join_circle(
  check_user_id uuid,
  check_circle_id uuid,
  log_block boolean default false
)
returns table (
  can_join boolean,
  requires_capacity_review boolean,
  active_circle_count integer,
  max_circles_without_review integer,
  reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer := 0;
  max_count integer;
  has_capacity boolean;
  existing_status text;
  review_reason text;
begin
  max_count := public.circle_participation_limit(check_user_id);
  review_reason := format(
    'You are already in %s active susu groups. SikaCircle must review your capacity before approving another group.',
    max_count
  );

  if auth.uid() is null or auth.uid() <> check_user_id then
    return query select false, false, 0, max_count,
      'Please sign in before joining a circle.';
    return;
  end if;

  select cm.status into existing_status
  from public.circle_members cm
  where cm.circle_id = check_circle_id and cm.user_id = check_user_id
  limit 1;

  if existing_status is not null then
    return query select false, false,
      public.user_active_circle_count(check_user_id), max_count,
      'You are already a member of this circle.';
    return;
  end if;

  has_capacity := public.circle_has_member_capacity(check_circle_id);
  if not has_capacity then
    return query select false, false,
      public.user_active_circle_count(check_user_id), max_count,
      'This circle already has the maximum 15 members.';
    return;
  end if;

  active_count := public.user_active_circle_count(check_user_id);
  if active_count >= max_count then
    if log_block then
      insert into public.audit_logs(
        staff_user_id, action, target_type, target_id, notes, metadata
      ) values (
        check_user_id, 'join_requires_capacity_review', 'circle',
        check_circle_id, review_reason,
        jsonb_build_object(
          'user_id', check_user_id,
          'active_circle_count', active_count,
          'max_circles_without_review', max_count,
          'test_account', public.is_app_test_account(check_user_id)
        )
      );
    end if;
    return query select true, true, active_count, max_count, review_reason;
    return;
  end if;

  return query select true, false, active_count, max_count,
    case when public.is_app_test_account(check_user_id)
      then 'Test account join request allowed.'
      else 'Join request allowed.'
    end;
end;
$$;

create or replace function public.flag_capacity_review_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_count integer;
  max_count integer;
  obligation numeric;
  verification text;
begin
  if new.role in ('creator', 'admin') then
    new.requires_capacity_review := false;
    new.capacity_review_status := 'not_required';
    return new;
  end if;

  active_count := public.user_active_circle_count(new.user_id);
  max_count := public.circle_participation_limit(new.user_id);

  if active_count >= max_count then
    obligation := public.user_periodic_obligation(new.user_id);
    select uv.verification_status::text into verification
    from public.user_verifications uv
    where uv.user_id = new.user_id limit 1;

    new.requires_capacity_review := true;
    new.capacity_review_status := 'pending';
    new.status := 'pending_capacity_review';

    insert into public.capacity_reviews(
      user_id, circle_id, active_circle_count,
      estimated_periodic_obligation, missed_late_contribution_count,
      verification_status, status, created_at, updated_at
    ) values (
      new.user_id, new.circle_id, active_count,
      obligation, public.user_missed_late_contribution_count(new.user_id),
      coalesce(verification, 'not_started'), 'pending', now(), now()
    )
    on conflict (user_id, circle_id) do update set
      active_circle_count = excluded.active_circle_count,
      estimated_periodic_obligation = excluded.estimated_periodic_obligation,
      missed_late_contribution_count = excluded.missed_late_contribution_count,
      verification_status = excluded.verification_status,
      status = 'pending',
      updated_at = now();
  else
    new.requires_capacity_review := false;
    new.capacity_review_status := 'not_required';
  end if;
  return new;
end;
$$;

-- A test account may finish a test Circle through one controlled RPC.
-- Empty Circles are deleted by the existing guarded function. Any Circle with
-- financial or member activity is archived so its history remains immutable.
create or replace function public.finish_test_circle(check_circle_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
  eligibility record;
begin
  if auth.uid() is null or not public.is_app_test_account(auth.uid()) then
    raise exception 'Test account authorization required';
  end if;

  select * into target_circle
  from public.circles
  where id = check_circle_id
  for update;

  if target_circle.id is null then raise exception 'Circle not found'; end if;
  if target_circle.owner_id <> auth.uid()
    and not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only the test Circle owner or administrator can finish it';
  end if;

  select * into eligibility
  from public.get_circle_lifecycle_eligibility(check_circle_id);

  if eligibility.can_delete then
    perform public.delete_circle(check_circle_id);
    insert into public.audit_logs(
      staff_user_id, action, target_type, target_id, notes, metadata
    ) values (
      auth.uid(), 'test_circle_deleted', 'circle', check_circle_id,
      'Unused test Circle permanently deleted.',
      jsonb_build_object('test_account', true)
    );
    return 'deleted';
  end if;

  perform public.archive_circle(check_circle_id);
  insert into public.audit_logs(
    staff_user_id, action, target_type, target_id, notes, metadata
  ) values (
    auth.uid(), 'test_circle_archived', 'circle', check_circle_id,
    'Test Circle with activity archived to preserve financial history.',
    jsonb_build_object(
      'test_account', true,
      'contribution_count', eligibility.contribution_count,
      'payout_count', eligibility.payout_count,
      'payment_transaction_count', eligibility.payment_transaction_count,
      'wallet_transaction_count', eligibility.wallet_transaction_count
    )
  );
  return 'archived';
end;
$$;

-- Treat protected funds sourced from a designated test account as test records.
-- This keeps them blocked by the existing payout release engine.
create or replace function public.protected_fund_is_test_record(
  check_fund public.protected_fund_ledger
)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    public.is_app_test_account(check_fund.user_id)
    or coalesce(check_fund.metadata->>'test_record', '') = 'true'
    or exists (
      select 1 from public.payment_transactions pt
      where pt.id = check_fund.source_payment_transaction_id
        and (
          lower(coalesce(pt.provider_response->>'payment_env', '')) = 'sandbox'
          or lower(coalesce(pt.provider_response->>'mode', '')) = 'sandbox'
          or lower(coalesce(pt.provider_response->>'label', '')) like '%test%'
        )
    )
    or exists (
      select 1 from public.wallet_transactions wt
      where wt.id = check_fund.source_transaction_id
        and (
          lower(coalesce(wt.metadata->>'payment_env', '')) = 'sandbox'
          or lower(coalesce(wt.metadata->>'mode', '')) = 'sandbox'
          or lower(coalesce(wt.metadata->>'label', '')) like '%test%'
        )
    );
$$;

revoke all on function public.is_app_test_account(uuid) from public, anon;
revoke all on function public.circle_admin_limit(uuid) from public, anon;
revoke all on function public.circle_participation_limit(uuid) from public, anon;
revoke all on function public.finish_test_circle(uuid) from public, anon;
grant execute on function public.is_app_test_account(uuid) to authenticated;
grant execute on function public.circle_admin_limit(uuid) to authenticated;
grant execute on function public.circle_participation_limit(uuid) to authenticated;
grant execute on function public.finish_test_circle(uuid) to authenticated;

notify pgrst, 'reload schema';
