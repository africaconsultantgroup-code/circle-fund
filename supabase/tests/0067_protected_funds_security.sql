begin;
select plan(14);

select has_table('public', 'protected_fund_ledger', 'protected fund ledger exists');
select has_table('public', 'protected_fund_events', 'protected event ledger exists');
select has_table('public', 'protection_reconciliation_queue', 'reconciliation queue exists');
select has_column('public', 'protected_fund_ledger', 'source_payment_transaction_id', 'payment source is linked');
select has_column('public', 'protected_fund_ledger', 'source_transaction_id', 'wallet source is linked');
select has_column('public', 'protected_fund_ledger', 'beneficiary_user_id', 'beneficiary is locked');
select has_column('public', 'protected_fund_ledger', 'maturity_date', 'maturity is recorded');
select has_column('public', 'protected_fund_ledger', 'custody_provider', 'future custody provider is supported');
select has_function('public', 'protect_successful_payment', array['uuid'], 'confirmed payment protection function exists');
select has_function('public', 'protect_confirmed_wallet_transaction', array['uuid'], 'wallet protection function exists');
select has_function('public', 'advance_protected_fund_maturity', array['date'], 'maturity function exists');
select has_function('public', 'set_protected_fund_freeze', array['uuid', 'text', 'text'], 'freeze function exists');
select has_function('public', 'get_protection_reconciliation_report', array[]::text[], 'reconciliation report exists');
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname = 'public' and tablename = 'protected_fund_ledger' and cmd <> 'SELECT'$$,
  array[0::bigint],
  'customers have no direct protected ledger write policy'
);

select * from finish();
rollback;
