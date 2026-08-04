begin;
select plan(18);

select has_table('public', 'fund_releases', 'fund releases table exists');
select has_table('public', 'fund_release_allocations', 'release allocations table exists');
select has_table('public', 'payout_receipts', 'payout receipts table exists');
select has_table('public', 'payout_reconciliation_queue', 'payout reconciliation table exists');
select has_table('public', 'payout_execution_settings', 'execution settings table exists');
select has_function('public', 'get_payout_preview', array['date'], 'server payout preview exists');
select has_function('public', 'create_fund_release_from_preview', array['text'], 'controlled release creation exists');
select has_function('public', 'record_payout_provider_result', array['uuid','text','text','text','text'], 'provider result handler exists');
select results_eq(
  $$select execution_mode from public.payout_execution_settings where singleton$$,
  array['preview'::text],
  'execution defaults to preview'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname='public' and tablename='fund_releases' and cmd <> 'SELECT'$$,
  array[0::bigint],
  'customers have no fund release write policy'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname='public' and tablename='fund_release_allocations' and cmd <> 'SELECT'$$,
  array[0::bigint],
  'customers have no allocation write policy'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname='public' and tablename='payout_receipts' and cmd <> 'SELECT'$$,
  array[0::bigint],
  'customers have no receipt write policy'
);
select results_eq(
  $$select count(*)::bigint from public.fund_releases where status='released'$$,
  array[0::bigint],
  'deployment releases no funds'
);
select results_eq(
  $$select count(*)::bigint from public.fund_release_allocations$$,
  array[0::bigint],
  'preview deployment reserves no funds'
);
select results_eq(
  $$select count(*)::bigint from public.protected_fund_ledger where amount < 0$$,
  array[0::bigint],
  'protected balances remain nonnegative'
);
select results_eq(
  $$select count(*)::bigint from public.protection_reconciliation_queue where source_payment_transaction_id='8a37fed5-96db-45ba-8e60-9d29cc216bb1'::uuid and coalesce((details->>'payout_excluded')::boolean,false)$$,
  array[1::bigint],
  'known unmatched GHS 100 payment is payout excluded'
);
select results_eq(
  $$select count(*)::bigint from public.get_payout_preview(current_date) where amount=100 and piggy_id is null$$,
  array[0::bigint],
  'unmatched GHS 100 payment is absent from preview'
);
select results_eq(
  $$select count(*)::bigint from public.get_payout_preview(current_date) where is_test_record and eligibility <> 'BLOCKED_TEST_RECORD'$$,
  array[0::bigint],
  'test candidates are blocked'
);

select * from finish();
rollback;
