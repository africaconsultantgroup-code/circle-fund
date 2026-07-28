-- 0075_goal_susu_automatic_contribution.sql
-- Calculates new Goal Susu per-member contributions from the overall target,
-- member count, contribution frequency, and overall dates.

create or replace function public.calculate_goal_susu_contribution(
  target_amount numeric,
  maximum_members integer,
  contribution_frequency text,
  overall_start_date date,
  overall_end_date date
)
returns table (
  contribution_amount numeric,
  contribution_occurrences integer
)
language plpgsql
immutable
set search_path = public
as $$
declare
  occurrence_count integer;
  calculated_amount numeric;
begin
  if target_amount is null or target_amount <= 0 then
    raise exception 'Goal target must be greater than zero';
  end if;
  if maximum_members is null or maximum_members < 2 or maximum_members > 15 then
    raise exception 'Maximum members must be between 2 and 15';
  end if;
  if contribution_frequency not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Unsupported contribution frequency';
  end if;
  if overall_start_date is null or overall_end_date is null
    or overall_end_date <= overall_start_date then
    raise exception 'Goal end date must be after the start date';
  end if;

  occurrence_count := public.goal_contribution_occurrences(
    overall_start_date,
    overall_end_date,
    overall_start_date,
    contribution_frequency
  );
  if occurrence_count < 1 then
    raise exception 'Goal must contain at least one contribution date';
  end if;

  -- Round upward to two decimal places so currency rounding never leaves the
  -- final target underfunded.
  calculated_amount := ceil(
    (target_amount * 100)
      / (maximum_members::numeric * occurrence_count::numeric)
  ) / 100;

  return query select calculated_amount, occurrence_count;
end;
$$;

create or replace function public.set_goal_susu_contribution_amount()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  calculation record;
begin
  if new.circle_type <> 'goal' then return new; end if;

  select * into calculation
  from public.calculate_goal_susu_contribution(
    new.goal_amount,
    new.max_members,
    new.frequency,
    new.start_date::date,
    new.end_date::date
  );
  new.contribution_amount := calculation.contribution_amount;
  return new;
end;
$$;

drop trigger if exists set_goal_susu_contribution_amount_before_insert
  on public.circles;
create trigger set_goal_susu_contribution_amount_before_insert
before insert on public.circles
for each row execute function public.set_goal_susu_contribution_amount();

revoke all on function public.calculate_goal_susu_contribution(
  numeric, integer, text, date, date
) from public, anon;
grant execute on function public.calculate_goal_susu_contribution(
  numeric, integer, text, date, date
) to authenticated;

notify pgrst, 'reload schema';
