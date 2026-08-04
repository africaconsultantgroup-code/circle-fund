-- Safe circle deletion and non-destructive archival.

alter table public.circles
  add column if not exists archived_at timestamptz;

create or replace function public.get_circle_lifecycle_eligibility(check_circle_id uuid)
returns table (
  can_delete boolean,
  approved_member_count integer,
  pending_member_count integer,
  contribution_count integer,
  payout_count integer,
  payment_transaction_count integer,
  wallet_transaction_count integer,
  transaction_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
begin
  select * into target_circle
  from public.circles
  where id = check_circle_id;

  if target_circle.id is null then
    raise exception 'Circle not found';
  end if;

  if auth.uid() is null or not (
    target_circle.owner_id = auth.uid()
    or public.is_circle_admin(check_circle_id, auth.uid())
  ) then
    raise exception 'Only a circle owner or admin can manage this circle';
  end if;

  return query
  with activity as (
    select
      (select count(*)::integer from public.circle_members cm
        where cm.circle_id = check_circle_id
          and cm.status = 'approved'
          and cm.role not in ('creator', 'admin')) as approved_members,
      (select count(*)::integer from public.circle_members cm
        where cm.circle_id = check_circle_id
          and cm.status in ('pending', 'pending_capacity_review')) as pending_members,
      (select count(*)::integer from public.contributions c where c.circle_id = check_circle_id) as contributions,
      ((select count(*) from public.payouts p where p.circle_id = check_circle_id)
        + (select count(*) from public.payout_schedule ps where ps.circle_id = check_circle_id))::integer as payouts,
      (select count(*)::integer from public.payment_transactions pt where pt.circle_id = check_circle_id) as payment_transactions,
      (select count(*)::integer from public.wallet_transactions wt where wt.circle_id = check_circle_id) as wallet_transactions,
      (select count(*)::integer from public.transactions t where t.circle_id = check_circle_id) as transactions
  )
  select
    approved_members = 0
      and pending_members = 0
      and contributions = 0
      and payouts = 0
      and payment_transactions = 0
      and wallet_transactions = 0
      and transactions = 0,
    approved_members,
    pending_members,
    contributions,
    payouts,
    payment_transactions,
    wallet_transactions,
    transactions
  from activity;
end;
$$;

create or replace function public.delete_circle(check_circle_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  eligibility record;
begin
  -- Lock the circle so activity cannot race the eligibility check.
  perform 1 from public.circles where id = check_circle_id for update;
  select * into eligibility from public.get_circle_lifecycle_eligibility(check_circle_id);

  if not eligibility.can_delete then
    raise exception 'This circle has activity and must be archived instead';
  end if;

  delete from public.circles where id = check_circle_id;
  return found;
end;
$$;

create or replace function public.archive_circle(check_circle_id uuid)
returns public.circles
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
begin
  select * into target_circle
  from public.circles
  where id = check_circle_id
  for update;

  if target_circle.id is null then
    raise exception 'Circle not found';
  end if;

  if auth.uid() is null or not (
    target_circle.owner_id = auth.uid()
    or public.is_circle_admin(check_circle_id, auth.uid())
  ) then
    raise exception 'Only a circle owner or admin can manage this circle';
  end if;

  update public.circles
  set status = 'archived', archived_at = coalesce(archived_at, now()), updated_at = now()
  where id = check_circle_id
  returning * into target_circle;

  return target_circle;
end;
$$;

create or replace function public.prevent_archived_circle_activity()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  previous_circle_id uuid;
  next_circle_id uuid;
begin
  if tg_op <> 'INSERT' then
    previous_circle_id := old.circle_id;
  end if;

  if tg_op <> 'DELETE' then
    next_circle_id := new.circle_id;
  end if;

  if exists (
    select 1 from public.circles c
    where c.status = 'archived'
      and c.id in (previous_circle_id, next_circle_id)
  ) then
    raise exception 'This circle is archived and its history is read-only';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_archived_circle_members on public.circle_members;
create trigger prevent_archived_circle_members
before insert or update or delete on public.circle_members
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_contributions on public.contributions;
create trigger prevent_archived_circle_contributions
before insert or update or delete on public.contributions
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_payouts on public.payouts;
create trigger prevent_archived_circle_payouts
before insert or update or delete on public.payouts
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_payout_schedule on public.payout_schedule;
create trigger prevent_archived_circle_payout_schedule
before insert or update or delete on public.payout_schedule
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_payments on public.payment_transactions;
create trigger prevent_archived_circle_payments
before insert or update or delete on public.payment_transactions
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_contribution_payments on public.contribution_payments;
create trigger prevent_archived_circle_contribution_payments
before insert or update or delete on public.contribution_payments
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_wallet_transactions on public.wallet_transactions;
create trigger prevent_archived_circle_wallet_transactions
before insert or update or delete on public.wallet_transactions
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_transactions on public.transactions;
create trigger prevent_archived_circle_transactions
before insert or update or delete on public.transactions
for each row execute function public.prevent_archived_circle_activity();

drop trigger if exists prevent_archived_circle_capacity_reviews on public.capacity_reviews;
create trigger prevent_archived_circle_capacity_reviews
before insert or update or delete on public.capacity_reviews
for each row execute function public.prevent_archived_circle_activity();

grant execute on function public.get_circle_lifecycle_eligibility(uuid) to authenticated;
grant execute on function public.delete_circle(uuid) to authenticated;
grant execute on function public.archive_circle(uuid) to authenticated;

notify pgrst, 'reload schema';
