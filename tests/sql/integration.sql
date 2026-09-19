\set ON_ERROR_STOP on
begin;
create schema si_test;
create function si_test.ok(v boolean,msg text) returns void language plpgsql as $$ begin if v is distinct from true then raise exception 'FAIL: %',msg; end if; raise notice 'PASS: %',msg; end $$;
create function si_test.fails(q text,pattern text) returns void language plpgsql as $$ declare did_fail boolean:=false; begin begin execute q; exception when others then if sqlerrm like pattern then did_fail:=true; else raise exception 'Wrong error: %, expected %',sqlerrm,pattern; end if; end; if not did_fail then raise exception 'Expected failure: %',pattern; end if; raise notice 'PASS: rejected %',pattern; end $$;
grant usage on schema si_test to authenticated,anon;
grant execute on all functions in schema si_test to authenticated,anon;
insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000001','owner-a@example.test'),('00000000-0000-4000-8000-000000000002','owner-b@example.test'),('00000000-0000-4000-8000-000000000003','cashier@example.test');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.si_bootstrap('Alpha','BDT','Asia/Dhaka','10000000-0000-4000-8000-000000000001')->>'id' as org_a \gset
select si_test.ok(public.si_bootstrap('Alpha','BDT','Asia/Dhaka','10000000-0000-4000-8000-000000000001')->>'id'=:'org_a','workspace creation is idempotent');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select public.si_bootstrap('Beta','USD','UTC','10000000-0000-4000-8000-000000000002')->>'id' as org_b \gset
select public.si_mutate(:'org_b','category_save','{"name":"Private"}',gen_random_uuid())->>'id' as category_b \gset
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select si_test.ok((select count(*)=1 from public.si_organizations),'RLS isolates organizations');
select si_test.fails(format('select public.si_mutate(%L,''category_save'',''{"name":"Intrusion"}'',gen_random_uuid())',:'org_b'),'%Workspace access denied%');
select si_test.fails(format('select public.si_mutate(%L,''product_save'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('name','Bad category','sku','BAD','price_minor',100,'category_id',:'category_b')::text),'%active category%');
select public.si_mutate(:'org_a','product_save','{"name":"Rice","sku":"RICE","price_minor":300,"reorder_level":3}',gen_random_uuid())->>'id' as product \gset
select public.si_mutate(:'org_a','product_save','{"name":"Empty","sku":"EMPTY","price_minor":100}',gen_random_uuid())->>'id' as empty_product \gset
select si_test.ok((select stock=0 from public.si_products where id=:'product'),'new products start at zero stock');
select si_test.fails(format('update public.si_products set stock=99 where id=%L',:'product'),'%permission denied%');
select public.si_mutate(:'org_a','contact_save','{"kind":"supplier","name":"Supplier"}',gen_random_uuid())->>'id' as supplier \gset
select public.si_mutate(:'org_a','contact_save','{"kind":"customer","name":"Customer"}',gen_random_uuid())->>'id' as customer \gset
select public.si_mutate(:'org_a','purchase_save',jsonb_build_object('supplier_id',:'supplier','paid_minor',500,'lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',10,'unit_cost_minor',100))),gen_random_uuid())->>'id' as purchase \gset
select si_test.ok((select stock=0 from public.si_products where id=:'product'),'draft purchases do not change stock');
select gen_random_uuid() as receive_key \gset
select public.si_mutate(:'org_a','purchase_receive',jsonb_build_object('id',:'purchase'),:'receive_key');
select public.si_mutate(:'org_a','purchase_receive',jsonb_build_object('id',:'purchase'),:'receive_key');
select si_test.ok((select stock=10 and cost_minor=100 from public.si_products where id=:'product'),'receive is idempotent and establishes average cost');
select si_test.fails(format('select public.si_mutate(%L,''purchase_receive'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'purchase')::text),'%Only a draft%');
select si_test.fails(format('select public.si_mutate(%L,''purchase_cancel'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'purchase')::text),'%Only a draft%');
select si_test.fails(format('select public.si_mutate(%L,''sale_checkout'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',2),jsonb_build_object('product_id',:'empty_product','quantity',1)),'payment_method','cash','expected_total_minor',700,'tendered_minor',700)::text),'%Insufficient stock%');
select si_test.ok((select stock=10 from public.si_products where id=:'product') and (select count(*)=0 from public.si_sales),'multi-line failure rolls back the complete checkout');
select si_test.fails(format('select public.si_mutate(%L,''sale_checkout'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',1)),'payment_method','cash','expected_total_minor',1,'tendered_minor',1)::text),'%Prices or tax changed%');
select gen_random_uuid() as checkout_key \gset
select jsonb_build_object('lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',2,'unit_price_minor',1)),'payment_method','cash','expected_total_minor',600,'tendered_minor',1000) as checkout_payload \gset
select public.si_mutate(:'org_a','sale_checkout',:'checkout_payload',:'checkout_key')->>'id' as sale \gset
select si_test.ok(public.si_mutate(:'org_a','sale_checkout',:'checkout_payload',:'checkout_key')->>'id'=:'sale','checkout retry returns the original sale');
select si_test.ok((select stock=8 from public.si_products where id=:'product'),'POS decreases stock exactly once');
select si_test.ok((select total_minor=600 and change_minor=400 and paid_minor=600 from public.si_sales where id=:'sale'),'server ignores tampered price and calculates cash change');
select si_test.fails(format('select public.si_mutate(%L,''sale_checkout'',%L,%L)',:'org_a','{"changed":true}',:'checkout_key'),'%different data%');
select public.si_mutate(:'org_a','sale_return',jsonb_build_object('id',:'sale','reason','Damaged packaging','lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',1))),gen_random_uuid());
select si_test.ok((select stock=9 from public.si_products where id=:'product') and (select returned_minor=300 and refunded_minor=300 from public.si_sales where id=:'sale'),'partial return restores one unit and refunds correctly');
select si_test.fails(format('select public.si_mutate(%L,''sale_return'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'sale','reason','Too many','lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',2)))::text),'%exceeds sold%');
select public.si_mutate(:'org_a','sale_void',jsonb_build_object('id',:'sale','reason','Cancel remaining sale'),gen_random_uuid());
select si_test.ok((select stock=10 from public.si_products where id=:'product') and (select status='voided' and refunded_minor=600 from public.si_sales where id=:'sale'),'void restores only remaining units');
select public.si_mutate(:'org_a','sale_checkout',jsonb_build_object('customer_id',:'customer','lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',1)),'payment_method','credit','expected_total_minor',300,'tendered_minor',0),gen_random_uuid())->>'id' as credit_sale \gset
select public.si_mutate(:'org_a','payment_add',jsonb_build_object('id',:'credit_sale','source_type','sale','method','mobile','amount_minor',150),gen_random_uuid());
select si_test.fails(format('select public.si_mutate(%L,''payment_add'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'credit_sale','source_type','sale','method','cash','amount_minor',151)::text),'%outside the allowed range%');
select si_test.ok((select paid_minor=150 from public.si_sales where id=:'credit_sale'),'failed overpayment leaves balance unchanged');
select public.si_mutate(:'org_a','purchase_return',jsonb_build_object('id',:'purchase','reason','Return to supplier','lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',6))),gen_random_uuid());
select si_test.ok((select stock=3 from public.si_products where id=:'product') and (select returned_minor=600 and refunded_minor=100 from public.si_purchases where id=:'purchase'),'supplier return reduces stock and settles due before refund');
select si_test.fails(format('select public.si_mutate(%L,''purchase_return'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'purchase','reason','No stock','lines',jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',4)))::text),'%Insufficient stock%');
select public.si_mutate(:'org_a','member_save','{"email":"cashier@example.test","role":"cashier"}',gen_random_uuid());
select si_test.fails(format('select public.si_mutate(%L,''member_save'',''{"email":"owner-a@example.test","role":"cashier"}'',gen_random_uuid())',:'org_a'),'%at least one active owner%');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select si_test.ok((select count(*)=0 from public.si_purchases),'cashier cannot read purchases');
select si_test.fails(format('select public.si_mutate(%L,''stock_adjust'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'product','delta',5,'reason','Unauthorized')::text),'%Manager access required%');
select si_test.fails(format('select public.si_report(%L,current_date,current_date)',:'org_a'),'%Manager access required%');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select si_test.ok((select count(*)=0 from public.si_products where id=:'product'),'cross-tenant product is invisible');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select si_test.ok((select p.stock=(select sum(m.delta) from public.si_stock_movements m where m.product_id=p.id) from public.si_products p where p.id=:'product'),'stock reconciles with immutable movement ledger');
select si_test.ok((public.si_report(:'org_a',current_date-1,current_date+1)->'summary'->>'net_sales_minor')::bigint=300,'report accounts for sales and returns by event date');
select si_test.fails(format('select public.si_mutate(%L,''stock_adjust'',%L,gen_random_uuid())',:'org_a',jsonb_build_object('id',:'product','delta',-4,'reason','Negative stock')::text),'%invalid stock%');
set local role anon;
select si_test.fails(format('select public.si_dashboard(%L)',:'org_a'),'%permission denied%');
rollback;
