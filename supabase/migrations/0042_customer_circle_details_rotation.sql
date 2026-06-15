-- 0042_customer_circle_details_rotation.sql
-- Aligns customer circle details, member privacy, and payout rotation statuses.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'payout_schedule_status_check'
      and conrelid = 'public.payout_schedule'::regclass
  ) then
    alter table public.payout_schedule
      drop constraint payout_schedule_status_check;
  end if;
end $$;

alter table public.payout_schedule
  add constraint payout_schedule_status_check
  check (status in ('scheduled', 'processing', 'pending', 'paid', 'skipped', 'failed'));

create or replace function public.get_circle_members(check_circle_id uuid)
returns table (
  membership_id uuid,
  circle_id uuid,
  user_id uuid,
  role text,
  status text,
  joined_at timestamptz,
  approved_at timestamptz,
  approved_by uuid,
  full_name text,
  phone text,
  country text,
  preferred_currency text,
  verification_status text,
  requires_capacity_review boolean,
  capacity_review_status text
)
language sql
security definer
set search_path = public
stable
as $$
  select
    cm.id,
    cm.circle_id,
    cm.user_id,
    cm.role,
    cm.status,
    cm.joined_at,
    cm.approved_at,
    cm.approved_by,
    coalesce(nullif(p.full_name, ''), 'Member'),
    null::text,
    null::text,
    p.preferred_currency::text,
    coalesce(uv.verification_status::text, 'not_started'),
    cm.requires_capacity_review,
    cm.capacity_review_status
  from public.circle_members cm
  left join public.profiles p on p.user_id = cm.user_id
  left join public.user_verifications uv on uv.user_id = cm.user_id
  where cm.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or (
        cm.status = 'approved'
        and public.is_approved_circle_member(check_circle_id, auth.uid())
      )
      or cm.user_id = auth.uid()
    )
  order by
    case cm.status
      when 'approved' then 1
      when 'pending' then 2
      when 'rejected' then 3
      else 4
    end,
    cm.joined_at asc nulls last;
$$;

create or replace function public.get_circle_payout_rotation(check_circle_id uuid)
returns table (
  schedule_id uuid,
  circle_id uuid,
  member_id uuid,
  user_id uuid,
  full_name text,
  role text,
  verification_status text,
  rotation_position integer,
  payout_due_date timestamptz,
  payout_amount numeric,
  status text,
  locked_at timestamptz,
  is_current_user boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    ps.id,
    ps.circle_id,
    ps.member_id,
    cm.user_id,
    coalesce(nullif(p.full_name, ''), 'Member'),
    cm.role,
    coalesce(uv.verification_status::text, 'not_started'),
    ps.rotation_position,
    ps.payout_due_date,
    ps.payout_amount,
    ps.status,
    ps.locked_at,
    cm.user_id = auth.uid()
  from public.payout_schedule ps
  join public.circle_members cm on cm.id = ps.member_id
  left join public.profiles p on p.user_id = cm.user_id
  left join public.user_verifications uv on uv.user_id = cm.user_id
  where ps.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or public.is_approved_circle_member(check_circle_id, auth.uid())
    )
  order by ps.rotation_position asc;
$$;

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
  from public.circles c
  where c.id = ps.circle_id
    and ps.locked_at is null
    and c.start_date is not null
    and c.start_date <= now();

  get diagnostics locked_count = row_count;
  return locked_count;
end;
$$;
