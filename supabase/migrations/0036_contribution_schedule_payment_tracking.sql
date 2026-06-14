-- 0036_contribution_schedule_payment_tracking.sql
-- Adds contribution obligations/schedule generation and manual payment tracking.

alter type public.contribution_status add value if not exists 'overdue';

alter table public.contributions
  add column if not exists member_id uuid references public.circle_members(id) on delete cascade,
  add column if not exists amount_due numeric,
  add column if not exists due_date timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists payment_reference text;

update public.contributions
set amount_due = coalesce(amount_due, amount)
where amount_due is null;

create unique index if not exists contributions_circle_member_due_date_key
  on public.contributions (circle_id, member_id, due_date)
  where member_id is not null and due_date is not null;

create or replace function public.next_circle_due_date(base_date timestamptz, frequency text, period_index integer)
returns timestamptz
language sql
immutable
as $$
  select case lower(coalesce(frequency, 'monthly'))
    when 'daily' then base_date + (period_index || ' days')::interval
    when 'weekly' then base_date + ((period_index * 7) || ' days')::interval
    when 'biweekly' then base_date + ((period_index * 14) || ' days')::interval
    when 'monthly' then base_date + (period_index || ' months')::interval
    else base_date + (period_index || ' months')::interval
  end;
$$;

create or replace function public.generate_circle_contribution_schedule(check_circle_id uuid, periods integer default 1)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
  member_record public.circle_members;
  period_index integer;
  due_at timestamptz;
  inserted_count integer := 0;
  affected_count integer := 0;
begin
  select *
  into target_circle
  from public.circles
  where id = check_circle_id;

  if target_circle.id is null then
    raise exception 'Circle not found';
  end if;

  if auth.uid() is not null and not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only circle admins can generate contribution schedules';
  end if;

  for member_record in
    select *
    from public.circle_members
    where circle_id = check_circle_id
      and status = 'approved'
  loop
    for period_index in 0..greatest(periods, 1) - 1 loop
      due_at := public.next_circle_due_date(
        coalesce(target_circle.start_date, now()),
        target_circle.frequency,
        period_index
      );

      insert into public.contributions (
        circle_id,
        member_id,
        user_id,
        amount,
        amount_due,
        contribution_date,
        due_date,
        status,
        created_at,
        updated_at
      )
      values (
        check_circle_id,
        member_record.id,
        member_record.user_id,
        coalesce(target_circle.contribution_amount, 0),
        coalesce(target_circle.contribution_amount, 0),
        due_at,
        due_at,
        'pending',
        now(),
        now()
      )
      on conflict (circle_id, member_id, due_date) where member_id is not null and due_date is not null
      do nothing;

      get diagnostics affected_count = row_count;
      inserted_count := inserted_count + affected_count;
    end loop;
  end loop;

  return inserted_count;
end;
$$;

create or replace function public.generate_circle_contribution_schedule_after_member_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' and old.status is distinct from new.status then
    perform public.generate_circle_contribution_schedule(new.circle_id, 1);
  end if;

  return new;
end;
$$;

drop trigger if exists generate_circle_contribution_schedule_after_member_approval_trigger on public.circle_members;
create trigger generate_circle_contribution_schedule_after_member_approval_trigger
  after update on public.circle_members
  for each row
  execute function public.generate_circle_contribution_schedule_after_member_approval();

create or replace function public.generate_circle_contribution_schedule_after_circle_member_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'approved' then
    perform public.generate_circle_contribution_schedule(new.circle_id, 1);
  end if;

  return new;
end;
$$;

drop trigger if exists generate_circle_contribution_schedule_after_circle_member_insert_trigger on public.circle_members;
create trigger generate_circle_contribution_schedule_after_circle_member_insert_trigger
  after insert on public.circle_members
  for each row
  execute function public.generate_circle_contribution_schedule_after_circle_member_insert();

create or replace function public.mark_contribution_paid_for_testing(check_contribution_id uuid, payment_reference text default null)
returns public.contributions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_contribution public.contributions;
  previous_status text;
begin
  select *
  into target_contribution
  from public.contributions
  where id = check_contribution_id;

  if target_contribution.id is null then
    raise exception 'Contribution not found';
  end if;

  if not public.is_circle_admin(target_contribution.circle_id, auth.uid()) then
    raise exception 'Only circle admins can mark contributions as paid';
  end if;

  previous_status := target_contribution.status::text;

  update public.contributions
  set status = 'paid',
      paid_at = now(),
      payment_reference = coalesce(nullif(payment_reference, ''), target_contribution.payment_reference, 'manual-test-' || substr(gen_random_uuid()::text, 1, 8)),
      updated_at = now()
  where id = check_contribution_id
  returning * into target_contribution;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'manual_mark_contribution_paid',
    'contribution',
    target_contribution.id,
    'Circle admin manually marked contribution as paid for testing.',
    jsonb_build_object(
      'actor_role', coalesce(public.current_user_staff_role(), 'circle_admin'),
      'circle_id', target_contribution.circle_id,
      'member_id', target_contribution.member_id,
      'user_id', target_contribution.user_id,
      'old_status', previous_status,
      'new_status', target_contribution.status::text,
      'payment_reference', target_contribution.payment_reference
    )
  );

  return target_contribution;
end;
$$;

drop function if exists public.get_circle_contribution_status(uuid);

create function public.get_circle_contribution_status(check_circle_id uuid)
returns table (
  contribution_id uuid,
  member_id uuid,
  user_id uuid,
  full_name text,
  expected_amount numeric,
  due_date timestamptz,
  status text,
  paid_at timestamptz,
  payment_reference text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    c.id,
    c.member_id,
    c.user_id,
    p.full_name,
    coalesce(c.amount_due, c.amount),
    c.due_date,
    case
      when c.status::text in ('paid', 'processed') then 'paid'
      when c.status::text = 'failed' then 'failed'
      when c.due_date is not null
        and c.due_date < now()
        and c.status::text in ('pending', 'unpaid') then 'overdue'
      when c.status::text in ('pending', 'unpaid') then 'unpaid'
      when c.status::text = 'late' then 'overdue'
      else c.status::text
    end as status,
    c.paid_at,
    coalesce(c.payment_reference, c.reference)
  from public.contributions c
  left join public.profiles p on p.user_id = c.user_id
  where c.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or c.user_id = auth.uid()
    )
  order by coalesce(c.due_date, c.contribution_date) asc;
$$;

drop policy if exists "Contributions: approved members can select own obligations" on public.contributions;
create policy "Contributions: approved members can select own obligations"
  on public.contributions
  as permissive
  for select
  using (auth.uid() = user_id);

drop policy if exists "Contributions: circle admins can select circle obligations" on public.contributions;
create policy "Contributions: circle admins can select circle obligations"
  on public.contributions
  as permissive
  for select
  using (public.is_circle_admin(circle_id, auth.uid()));

drop policy if exists "Contributions: circle admins can update circle obligations" on public.contributions;
create policy "Contributions: circle admins can update circle obligations"
  on public.contributions
  as permissive
  for update
  using (public.is_circle_admin(circle_id, auth.uid()))
  with check (public.is_circle_admin(circle_id, auth.uid()));
