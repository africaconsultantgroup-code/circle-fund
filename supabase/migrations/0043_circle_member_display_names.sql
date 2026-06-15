-- 0043_circle_member_display_names.sql
-- Uses profile names for customer circle member displays and keeps phone hidden.

alter table public.profiles
  add column if not exists name text,
  add column if not exists email text;

create or replace function public.profile_display_name(profile_user_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select coalesce(
        nullif(trim(p.full_name), ''),
        nullif(trim(p.name), ''),
        nullif(trim(p.email), '')
      )
      from public.profiles p
      where p.user_id = profile_user_id
      limit 1
    ),
    'Member'
  );
$$;

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
    public.profile_display_name(cm.user_id),
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
    public.profile_display_name(cm.user_id),
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
  left join public.user_verifications uv on uv.user_id = cm.user_id
  where ps.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or public.is_approved_circle_member(check_circle_id, auth.uid())
    )
  order by ps.rotation_position asc;
$$;

create or replace function public.get_circle_contribution_status(check_circle_id uuid)
returns table (
  contribution_id uuid,
  member_id uuid,
  user_id uuid,
  full_name text,
  expected_amount numeric,
  due_date timestamptz,
  status text,
  paid_at timestamptz,
  payment_reference text,
  payment_transaction_id uuid,
  payment_status text,
  payment_provider text,
  payment_created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  with latest_payment as (
    select distinct on (pt.contribution_id)
      pt.contribution_id,
      pt.id,
      pt.status,
      pt.provider,
      pt.provider_reference,
      pt.created_at
    from public.payment_transactions pt
    where pt.contribution_id is not null
    order by pt.contribution_id, pt.created_at desc
  )
  select
    c.id,
    c.member_id,
    c.user_id,
    public.profile_display_name(c.user_id),
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
    coalesce(lp.provider_reference, c.payment_reference, c.reference),
    lp.id,
    lp.status,
    lp.provider,
    lp.created_at
  from public.contributions c
  left join latest_payment lp on lp.contribution_id = c.id
  where c.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or c.user_id = auth.uid()
    )
  order by coalesce(c.due_date, c.contribution_date) asc;
$$;
