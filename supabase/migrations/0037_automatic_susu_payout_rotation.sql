-- 0037_automatic_susu_payout_rotation.sql
-- Adds fair automatic susu payout rotation planning.

create table if not exists public.payout_schedule (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles(id) on delete cascade,
  member_id uuid not null references public.circle_members(id) on delete cascade,
  rotation_position integer not null,
  payout_due_date timestamptz,
  payout_amount numeric not null default 0,
  status text not null default 'scheduled' check (status in ('scheduled', 'pending', 'paid', 'skipped', 'failed')),
  locked_at timestamptz,
  locked_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (circle_id, member_id),
  unique (circle_id, rotation_position)
);

alter table public.payout_schedule enable row level security;

create index if not exists payout_schedule_circle_id_idx on public.payout_schedule (circle_id, rotation_position);
create index if not exists payout_schedule_member_id_idx on public.payout_schedule (member_id);

drop policy if exists "Payout schedule: approved members can select circle order" on public.payout_schedule;
create policy "Payout schedule: approved members can select circle order"
  on public.payout_schedule
  as permissive
  for select
  using (
    public.is_circle_admin(circle_id, auth.uid())
    or exists (
      select 1
      from public.circle_members viewer
      where viewer.circle_id = payout_schedule.circle_id
        and viewer.user_id = auth.uid()
        and viewer.status = 'approved'
    )
  );

drop policy if exists "Payout schedule: circle admins can manage order" on public.payout_schedule;
create policy "Payout schedule: circle admins can manage order"
  on public.payout_schedule
  as permissive
  for all
  using (public.is_circle_admin(circle_id, auth.uid()))
  with check (public.is_circle_admin(circle_id, auth.uid()));

create or replace function public.circle_rotation_is_locked(check_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.payout_schedule ps
    where ps.circle_id = check_circle_id
      and ps.locked_at is not null
  );
$$;

create or replace function public.generate_circle_payout_rotation(check_circle_id uuid, regenerate boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
  approved_count integer := 0;
  existing_count integer := 0;
  inserted_count integer := 0;
  rotation_locked boolean := false;
begin
  select *
  into target_circle
  from public.circles
  where id = check_circle_id;

  if target_circle.id is null then
    raise exception 'Circle not found';
  end if;

  if not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only circle admins can generate payout rotation';
  end if;

  select count(*)
  into approved_count
  from public.circle_members
  where circle_id = check_circle_id
    and status = 'approved';

  if approved_count = 0 then
    raise exception 'Approve at least one member before generating payout rotation';
  end if;

  select count(*), coalesce(bool_or(locked_at is not null), false)
  into existing_count, rotation_locked
  from public.payout_schedule
  where circle_id = check_circle_id;

  if existing_count > 0 and rotation_locked then
    raise exception 'Payout rotation is locked and cannot be regenerated';
  end if;

  if existing_count > 0 and not regenerate then
    return 0;
  end if;

  if regenerate and coalesce(target_circle.start_date, now()) <= now() then
    raise exception 'Payout rotation can only be regenerated before the circle starts';
  end if;

  if existing_count > 0 and regenerate then
    delete from public.payout_schedule
    where circle_id = check_circle_id;

    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      'regenerate_payout_rotation',
      'circle',
      check_circle_id,
      'Circle admin regenerated payout rotation before the circle started.',
      jsonb_build_object(
        'circle_id', check_circle_id,
        'approved_member_count', approved_count,
        'frequency', target_circle.frequency,
        'start_date', target_circle.start_date
      )
    );
  else
    insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
    values (
      auth.uid(),
      'generate_payout_rotation',
      'circle',
      check_circle_id,
      'Circle admin generated payout rotation.',
      jsonb_build_object(
        'circle_id', check_circle_id,
        'approved_member_count', approved_count,
        'frequency', target_circle.frequency,
        'start_date', target_circle.start_date
      )
    );
  end if;

  with shuffled_members as (
    select
      cm.id as member_id,
      row_number() over (order by gen_random_uuid())::integer as rotation_position
    from public.circle_members cm
    where cm.circle_id = check_circle_id
      and cm.status = 'approved'
  ),
  inserted as (
    insert into public.payout_schedule (
      circle_id,
      member_id,
      rotation_position,
      payout_due_date,
      payout_amount,
      status,
      created_at,
      updated_at
    )
    select
      check_circle_id,
      sm.member_id,
      sm.rotation_position,
      public.next_circle_due_date(
        coalesce(target_circle.start_date, now()),
        target_circle.frequency,
        sm.rotation_position - 1
      ),
      coalesce(target_circle.contribution_amount, 0) * approved_count,
      'scheduled',
      now(),
      now()
    from shuffled_members sm
    returning 1
  )
  select count(*) into inserted_count from inserted;

  perform public.generate_circle_contribution_schedule(check_circle_id, approved_count);

  return inserted_count;
end;
$$;

create or replace function public.lock_circle_payout_rotation(check_circle_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  target_circle public.circles;
  locked_count integer := 0;
begin
  select *
  into target_circle
  from public.circles
  where id = check_circle_id;

  if target_circle.id is null then
    raise exception 'Circle not found';
  end if;

  if not public.is_circle_admin(check_circle_id, auth.uid()) then
    raise exception 'Only circle admins can lock payout rotation';
  end if;

  if coalesce(target_circle.start_date, now()) <= now() then
    raise exception 'Payout rotation can only be locked before the circle starts';
  end if;

  if not exists (select 1 from public.payout_schedule where circle_id = check_circle_id) then
    raise exception 'Generate payout rotation before locking it';
  end if;

  update public.payout_schedule
  set locked_at = coalesce(locked_at, now()),
      locked_by = coalesce(locked_by, auth.uid()),
      updated_at = now()
  where circle_id = check_circle_id
    and locked_at is null;

  get diagnostics locked_count = row_count;

  insert into public.audit_logs (staff_user_id, action, target_type, target_id, notes, metadata)
  values (
    auth.uid(),
    'lock_payout_rotation',
    'circle',
    check_circle_id,
    'Circle admin locked payout rotation.',
    jsonb_build_object(
      'circle_id', check_circle_id,
      'locked_count', locked_count,
      'start_date', target_circle.start_date
    )
  );

  return locked_count;
end;
$$;

create or replace function public.get_circle_payout_rotation(check_circle_id uuid)
returns table (
  schedule_id uuid,
  circle_id uuid,
  member_id uuid,
  user_id uuid,
  full_name text,
  role text,
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
    p.full_name,
    cm.role,
    ps.rotation_position,
    ps.payout_due_date,
    ps.payout_amount,
    ps.status,
    ps.locked_at,
    cm.user_id = auth.uid()
  from public.payout_schedule ps
  join public.circle_members cm on cm.id = ps.member_id
  left join public.profiles p on p.user_id = cm.user_id
  where ps.circle_id = check_circle_id
    and (
      public.is_circle_admin(check_circle_id, auth.uid())
      or exists (
        select 1
        from public.circle_members viewer
        where viewer.circle_id = check_circle_id
          and viewer.user_id = auth.uid()
          and viewer.status = 'approved'
      )
    )
  order by ps.rotation_position asc;
$$;
