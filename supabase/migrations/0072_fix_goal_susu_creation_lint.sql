-- Qualify Goal Susu creation lookups identified by production database lint.

create or replace function public.create_goal_susu_with_cycles(
  goal_name text,
  goal_description text,
  target_amount numeric,
  contribution_amount numeric,
  contribution_frequency text,
  payout_frequency text,
  overall_start_date date,
  overall_end_date date,
  maximum_members integer,
  currency text,
  invite_value text,
  beneficiary_type text,
  beneficiary_user_id uuid,
  beneficiary_name text,
  destination_reference text,
  mobile_money_network text,
  relationship_or_purpose text default null,
  twice_monthly_day_one integer default null,
  twice_monthly_day_two integer default null
)
returns public.circles
language plpgsql security definer set search_path = public as $$
declare created_circle public.circles;
declare created_membership public.circle_members;
declare created_beneficiary public.goal_susu_beneficiaries;
begin
  if auth.uid() is null or not public.user_passes_circle_onboarding(auth.uid()) then
    raise exception 'Circle onboarding requirements are not complete';
  end if;
  if trim(goal_name) = '' or target_amount <= 0 or contribution_amount <= 0 then
    raise exception 'Goal name, target and contribution must be valid';
  end if;
  if contribution_frequency not in ('weekly', 'biweekly', 'monthly') then
    raise exception 'Unsupported contribution frequency';
  end if;
  if overall_end_date <= overall_start_date then
    raise exception 'Overall end date must be after the start date';
  end if;
  if maximum_members < 2 or maximum_members > 15 then
    raise exception 'Maximum members must be between 2 and 15';
  end if;
  if beneficiary_type not in ('sikacircle_user', 'external') then
    raise exception 'Invalid beneficiary type';
  end if;
  if beneficiary_type = 'sikacircle_user' and beneficiary_user_id is null then
    raise exception 'Select a SikaCircle beneficiary';
  end if;
  if beneficiary_type = 'external' and beneficiary_user_id is not null then
    raise exception 'External beneficiary cannot use a SikaCircle user identifier';
  end if;
  if payout_frequency not in (
    'one_time', 'weekly', 'every_14_days', 'twice_monthly', 'monthly'
  ) then raise exception 'Unsupported Goal Susu payout frequency'; end if;
  if payout_frequency = 'twice_monthly' and (
    twice_monthly_day_one is null or twice_monthly_day_two is null
    or twice_monthly_day_one >= twice_monthly_day_two
  ) then raise exception 'Choose two distinct twice-monthly payout dates'; end if;

  insert into public.circles(
    owner_id, name, description, goal_amount, contribution_amount,
    base_currency, frequency, max_members, invite_token, invite_code,
    start_date, end_date, status, circle_type
  ) values (
    auth.uid(), trim(goal_name), nullif(trim(goal_description), ''),
    target_amount, contribution_amount, upper(currency),
    contribution_frequency, maximum_members, upper(invite_value),
    upper(invite_value), overall_start_date, overall_end_date,
    'active', 'goal'
  ) returning * into created_circle;

  insert into public.circle_members(
    circle_id, user_id, role, status, invited_by, approved_by, approved_at
  ) values (
    created_circle.id, auth.uid(), 'creator', 'approved',
    auth.uid(), auth.uid(), now()
  ) returning * into created_membership;

  insert into public.goal_susu_details(
    circle_id, target_amount, maturity_date, lifecycle_status,
    contribution_frequency, payout_frequency, overall_start_date,
    overall_end_date, twice_monthly_day_one, twice_monthly_day_two
  ) values (
    created_circle.id, target_amount, overall_end_date, 'draft',
    contribution_frequency, payout_frequency, overall_start_date,
    overall_end_date, twice_monthly_day_one, twice_monthly_day_two
  );

  insert into public.goal_susu_beneficiaries(
    circle_id, beneficiary_type, beneficiary_user_id, beneficiary_name,
    destination_reference, mobile_money_network, relationship_or_purpose
  ) values (
    created_circle.id, beneficiary_type, beneficiary_user_id,
    trim(beneficiary_name), trim(destination_reference),
    nullif(trim(mobile_money_network), ''),
    nullif(trim(relationship_or_purpose), '')
  ) returning * into created_beneficiary;

  perform public.generate_goal_susu_payout_cycles(created_circle.id);

  insert into public.goal_susu_member_acceptances(
    circle_id, membership_id, user_id, agreement_snapshot
  ) values (
    created_circle.id, created_membership.id, auth.uid(),
    jsonb_build_object(
      'circle_name', created_circle.name,
      'goal', created_circle.description,
      'target_amount', (
        select details.target_amount
        from public.goal_susu_details details
        where details.circle_id = created_circle.id
      ),
      'contribution_amount', contribution_amount,
      'contribution_frequency', contribution_frequency,
      'payout_frequency', payout_frequency,
      'overall_start_date', overall_start_date,
      'overall_end_date', overall_end_date,
      'twice_monthly_days', case when payout_frequency = 'twice_monthly'
        then jsonb_build_array(twice_monthly_day_one, twice_monthly_day_two)
        else null end,
      'beneficiary_name', created_beneficiary.beneficiary_name,
      'beneficiary_type', created_beneficiary.beneficiary_type,
      'masked_destination',
        public.mask_goal_destination(created_beneficiary.destination_reference),
      'protection_status', 'Protected in SikaCircle'
    )
  );
  insert into public.audit_logs(
    staff_user_id, action, target_type, target_id, notes, metadata
  ) values (
    auth.uid(), 'goal_susu_created', 'circle', created_circle.id,
    'Goal Susu created with independently funded payout cycles.',
    jsonb_build_object(
      'payout_frequency', payout_frequency,
      'contribution_frequency', contribution_frequency,
      'overall_end_date', overall_end_date,
      'beneficiary_id', created_beneficiary.id
    )
  );
  select circle_row.* into created_circle
  from public.circles circle_row
  where circle_row.id = created_circle.id;
  return created_circle;
end;
$$;

notify pgrst, 'reload schema';
