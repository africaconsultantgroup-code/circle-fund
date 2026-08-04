begin;
select plan(18);

select has_column('public', 'circles', 'circle_type', 'Circles distinguish rotational and Goal Susu');
select col_default_is('public', 'circles', 'circle_type', '''rotational''::text', 'Existing circles default to rotational');
select has_table('public', 'goal_susu_details', 'Goal Susu terms use the Circle architecture');
select has_table('public', 'goal_susu_beneficiaries', 'Goal beneficiaries are stored separately');
select has_table('public', 'goal_susu_member_acceptances', 'Member agreement acceptance is durable');
select has_table('public', 'goal_beneficiary_change_requests', 'Controlled beneficiary changes exist');
select has_table('public', 'goal_beneficiary_change_approvals', 'Beneficiary consensus is durable');
select has_column('public', 'protected_fund_ledger', 'goal_beneficiary_id', 'Protected funds identify Goal beneficiary');
select has_column('public', 'fund_releases', 'goal_beneficiary_id', 'Release foundation identifies Goal beneficiary');
select has_function('public', 'create_goal_susu', array[
  'text','text','numeric','numeric','text','date','date','integer',
  'text','text','text','uuid','text','text','text','text'
], 'Goal creation is server controlled');
select has_function('public', 'accept_goal_susu_terms', array['uuid'], 'Members explicitly accept Goal terms');
select has_function('public', 'goal_susu_progress', array['uuid'], 'Goal progress is calculated from confirmed records');
select has_function('public', 'get_goal_susu_payout_preview', array['date'], 'Goal payout preview is provider independent');
select results_eq(
  $$select count(*)::bigint from public.payout_execution_settings where execution_mode = 'preview'$$,
  array[1::bigint],
  'Payout execution remains preview-only'
);
select results_eq(
  $$select count(*)::bigint from public.circles where circle_type <> 'rotational'$$,
  array[0::bigint],
  'Historical circles remain rotational'
);
select results_eq(
  $$select count(*)::bigint from public.fund_releases where release_type = 'goal_susu_payout'$$,
  array[0::bigint],
  'Migration creates no Goal payout'
);
select results_eq(
  $$select count(*)::bigint from public.protection_reconciliation_queue
    where details->>'payout_excluded' = 'true'$$,
  array[1::bigint],
  'Known unmatched test payment remains excluded'
);
select results_eq(
  $$select count(*)::bigint from public.payout_schedule ps
    join public.circles c on c.id = ps.circle_id where c.circle_type = 'goal'$$,
  array[0::bigint],
  'Goal Susu has no rotating payout rows'
);

select * from finish();
rollback;
