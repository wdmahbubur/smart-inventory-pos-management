-- Keep the exact deferred balance/ledger invariant, but use its existing
-- (store_id, product_id, sequence) index rather than scanning all tenants.
-- EXPLAIN on the 14,240-row acceptance dataset: the unscoped query used
-- a sequential scan; the scoped predicate uses movements_product_sequence.
create or replace function private.check_balance_ledger()
returns trigger language plpgsql set search_path='' as $$
declare
 pid uuid:=coalesce(new.product_id,old.product_id);
 sid uuid:=coalesce(new.store_id,old.store_id);
 balance bigint;
 ledger numeric;
begin
 select quantity into balance from public.inventory_balances
 where store_id=sid and product_id=pid;
 select coalesce(sum(quantity_delta),0) into ledger from public.stock_movements
 where store_id=sid and product_id=pid;
 if (balance is not null and balance<>ledger) or (balance is null and ledger<>0) then
  perform private.fail('LEDGER_MISMATCH');
 end if;
 return null;
end $$;
revoke all on function private.check_balance_ledger() from public,anon,authenticated;

-- This bounded operational report does not benefit from JIT setup costs.
-- A 50,000-line localhost run measured purchase-report p95 802.59ms before,
-- and 525.73ms with JIT disabled for this function only (30 warm samples).
-- Do not change the project's global planner or disable integrity checks.
alter function public.get_report(text,jsonb,boolean) set jit=off;
