begin;
select plan(16);

select has_table('public', 'goal_susu_payout_cycles', 'Goal payout cycles exist');
select has_table('public', 'goal_susu_cycle_allocations', 'Cycle allocations exist');
select has_column('public', 'goal_susu_details', 'contribution_frequency', 'Contribution cadence is explicit');
select has_column('public', 'goal_susu_details', 'payout_frequency', 'Payout cadence is explicit');
select has_column('public', 'goal_susu_details', 'overall_start_date', 'Overall start date is explicit');
select has_column('public', 'goal_susu_details', 'overall_end_date', 'Overall end date is explicit');
select has_column('public', 'protected_fund_ledger', 'goal_susu_cycle_id', 'Protected funds bind to one cycle');
select has_column('public', 'fund_releases', 'goal_susu_cycle_id', 'Payout releases bind to one cycle');
select has_function('public', 'create_goal_susu_with_cycles', array[
  'text','text','numeric','numeric','text','text','date','date','integer',
  'text','text','text','uuid','text','text','text','text','integer','integer'
], 'Goal creation generates payout cycles');
select has_function('public', 'generate_goal_susu_payout_cycles', array['uuid'], 'Cycle generator exists');
select has_function('public', 'get_goal_susu_cycles', array['uuid'], 'Members can view cycles');
select results_eq(
  $$select public.goal_contribution_occurrences(
    '2026-08-01'::date, '2026-08-14'::date,
    '2026-08-01'::date, 'weekly'
  )$$,
  array[2],
  'Two weekly contributions belong to a 14-day cycle'
);
select results_eq(
  $$select public.next_twice_monthly_date(
    '2026-08-02'::date, 1, 15
  )$$,
  array['2026-08-15'::date],
  'Twice monthly uses predefined calendar dates'
);
select results_eq(
  $$select ('2026-08-01'::date + 14)$$,
  array['2026-08-15'::date],
  'Every 14 days advances by fourteen calendar days'
);
select results_eq(
  $$select count(*)::bigint from public.fund_releases
    where release_type = 'goal_susu_payout'$$,
  array[0::bigint],
  'No Goal payout is created by the migration'
);
select results_eq(
  $$select count(*)::bigint from public.payout_execution_settings
    where execution_mode = 'preview'$$,
  array[1::bigint],
  'Payout execution remains preview-only'
);

select * from finish();
rollback;
