import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,uid,owner,base,product,rpc,asOwner,balance,purchase,sale} from './helpers';
after(()=>pool.end());
test('AT-01/02: signup and repeat onboarding create exactly one empty store',async()=>{
 const u=await owner(); const a=await rpc(u,'create_owner_store',[]); const b=await rpc(u,'create_owner_store',[]);assert.deepEqual(a,b);
 for(const table of ['products','purchases','sales','stock_movements']) assert.equal((await asOwner(u,`select * from public.${table}`)).length,0);
 assert.equal((await asOwner(u,'select * from public.stores')).length,1);
});
test('AT-03: invalid onboarding names roll back Auth/profile/store together',async()=>{
 const id=uid(); await assert.rejects(pool.query('insert into auth.users(id,raw_user_meta_data) values($1,$2)',[id,{full_name:'x',store_name:'ok'}]),/VALIDATION_ERROR/);
 assert.equal((await pool.query('select * from auth.users where id=$1',[id])).rowCount,0);
});
test('AT-07/08/09: two-owner RLS, mutation isolation and cross-store category rejection',async()=>{
 const a=await base(),b=await base(),p=await product(a);
 assert.equal((await asOwner(b.user,'select * from public.products where id=$1',[p.id])).length,0);
 await assert.rejects(rpc(b.user,'catalog_mutate',['product','delete',{id:p.id,expected_version:1},uid()]),/NOT_FOUND/);
 await assert.rejects(rpc(b.user,'catalog_mutate',['product','save',p.payload,uid()]),/NOT_FOUND/);
 await assert.rejects(asOwner(b.user,'select * from private.operation_requests'),/permission denied/);
});
test('AT-10/11/14/16: zero balance, strict fields, normalized SKU, dependency-safe deletion',async()=>{
 const a=await base(),p=await product(a,'DR-001');assert.equal(await balance(a.user,p.id),0);
 await assert.rejects(rpc(a.user,'catalog_mutate',['product','save',{...p.payload,sku:' dr-001 '},uid()]),/SKU_EXISTS/);
 await assert.rejects(rpc(a.user,'catalog_mutate',['product','save',{...p.payload,sku:'other',quantity:7},uid()]),/VALIDATION_ERROR/);
 await assert.rejects(asOwner(a.user,'update public.inventory_balances set quantity=100 where product_id=$1',[p.id]),/permission denied/);
 await assert.rejects(rpc(a.user,'catalog_mutate',['category','delete',{id:a.category,expected_version:1},uid()]),/REFERENCE_IN_USE/);
 await rpc(a.user,'catalog_mutate',['product','delete',{id:p.id,expected_version:1},uid()]);assert.equal(await balance(a.user,p.id),undefined);
});
test('AT-18/19/24: drafts never post stock, enforce versioning and never reuse deleted numbers',async()=>{
 const a=await base(),p=await product(a),body=purchase(a.supplier,[{product_id:p.id,quantity:10,unit_cost_paisa:'7000'}]);
 const d=await rpc<{id:string,number:string,version:number}>(a.user,'write_purchase',[body,uid(),false]);assert.equal(await balance(a.user,p.id),0);
 assert.equal((await asOwner(a.user,'select * from public.stock_movements')).length,0);
 const v=await rpc<{version:number}>(a.user,'write_purchase',[{...body,id:d.id,expected_version:d.version},uid(),false]);assert.equal(v.version,2);
 await assert.rejects(rpc(a.user,'write_purchase',[{...body,id:d.id,expected_version:1},uid(),false]),/VERSION_CONFLICT/);
 await rpc(a.user,'delete_purchase_draft',[d.id,2,uid()]);
 const next=await rpc(a.user,'write_purchase',[body,uid(),false]);assert.notEqual(next.number,d.number);
});
test('AT-17: archive supplier/product referenced by a draft is blocked',async()=>{
 const a=await base(),p=await product(a);await rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:p.id,quantity:1,unit_cost_paisa:'100'}]),uid(),false]);
 await assert.rejects(rpc(a.user,'catalog_mutate',['supplier','archive',{id:a.supplier,expected_version:1},uid()]),/DRAFT_IN_USE/);
 await assert.rejects(rpc(a.user,'catalog_mutate',['product','archive',{id:p.id,expected_version:1},uid()]),/DRAFT_IN_USE/);
});
test('AT-20/21/22/25: receipt retries once, actual cost remains independent, already-received safe',async()=>{
 const a=await base(),p=await product(a),body=purchase(a.supplier,[{product_id:p.id,quantity:20,unit_cost_paisa:'6000'}]),key=uid();
 const first=await rpc(a.user,'write_purchase',[body,key,true]),retry=await rpc(a.user,'write_purchase',[body,key,true]);assert.deepEqual(first,retry);
 assert.equal(await balance(a.user,p.id),20);assert.equal(first.total_paisa,'120000');
 const again=await rpc(a.user,'write_purchase',[{...body,id:first.id,expected_version:1},uid(),true]);assert.equal(again.already_received,true);
 assert.equal((await asOwner(a.user,'select * from public.stock_movements')).length,1);
 assert.equal((await asOwner<{reference_cost_paisa:string}>(a.user,'select reference_cost_paisa from public.products where id=$1',[p.id]))[0].reference_cost_paisa,'7000');
});
test('AT-12/13/15/27: sample sale captures immutable prices, correct net/cash/change and balances',async()=>{
 const a=await base(),c=await product(a,'COKE'),h=await product(a,'CHIPS','5000','3000');
 await rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:c.id,quantity:30,unit_cost_paisa:'7000'},{product_id:h.id,quantity:20,unit_cost_paisa:'3000'}]),uid(),true]);
 const body={items:[...sale(c.id,2).items,...sale(h.id,3,'5000').items],discount_paisa:'2000',cash_received_paisa:'50000'};
 const sold=await rpc(a.user,'complete_sale',[body,uid()]);assert.equal(sold.total_paisa,'33000');assert.equal(sold.change_paisa,'17000');assert.equal(await balance(a.user,c.id),28);assert.equal(await balance(a.user,h.id),17);
 await rpc(a.user,'catalog_mutate',['product','save',{...c.payload,id:c.id,expected_version:1,name:'Renamed',selling_price_paisa:'15000'},uid()]);
 const snapshot=await asOwner<{product_name_snapshot:string;unit_price_paisa:string;unit_cost_paisa:string;line_cost_paisa:string}>(a.user,'select * from public.sale_items where sale_id=$1 and product_id=$2',[sold.id,c.id]);assert.equal(snapshot[0].product_name_snapshot,'COKE');assert.equal(snapshot[0].unit_price_paisa,'10000');assert.equal(snapshot[0].unit_cost_paisa,'7000');assert.equal(snapshot[0].line_cost_paisa,'14000');
 await assert.rejects(rpc(a.user,'catalog_mutate',['product','save',{...c.payload,id:c.id,expected_version:2,sku:'DIFFERENT'},uid()]),/IDENTITY_IMMUTABLE/);
 await assert.rejects(rpc(a.user,'catalog_mutate',['product','archive',{id:c.id,expected_version:2},uid()]),/STOCK_NOT_ZERO/);
});
test('AT-28/29/30/31: invalid tender/discount/quantity/price and one unavailable line do not post',async()=>{
 const a=await base(),p=await product(a),empty=await product(a);await rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:p.id,quantity:2,unit_cost_paisa:'7000'}]),uid(),true]);
 for(const body of [{...sale(p.id),cash_received_paisa:'1'},{...sale(p.id),discount_paisa:'10000'},sale(p.id,0),{...sale(p.id),items:[{...sale(p.id).items[0],quantity:1.5}]},sale(p.id,1,'9999'),{...sale(p.id),items:[...sale(p.id).items,...sale(empty.id).items]}]) await assert.rejects(rpc(a.user,'complete_sale',[body,uid()]));
 assert.equal(await balance(a.user,p.id),2);assert.equal((await asOwner(a.user,'select * from public.sales')).length,0);
});
test('AT-32: concurrent last-unit sales have exactly one winner',async()=>{
 const a=await base(),p=await product(a);await rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:p.id,quantity:1,unit_cost_paisa:'7000'}]),uid(),true]);
 const results=await Promise.allSettled([rpc(a.user,'complete_sale',[sale(p.id),uid()]),rpc(a.user,'complete_sale',[sale(p.id),uid()])]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(await balance(a.user,p.id),0);
});
test('AT-33/34/35: simultaneous identical requests and lost-response recovery return the same receipt',async()=>{
 const a=await base(),p=await product(a);await rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:p.id,quantity:3,unit_cost_paisa:'7000'}]),uid(),true]);
 const key=uid(),body=sale(p.id),[x,y]=await Promise.all([rpc(a.user,'complete_sale',[body,key]),rpc(a.user,'complete_sale',[body,key])]);assert.deepEqual(x,y);assert.equal(await balance(a.user,p.id),2);
 const status=await rpc<{committed:boolean,result:unknown}>(a.user,'get_operation_result',['complete_sale',key]);assert.equal(status.committed,true);assert.deepEqual(status.result,x);
 await assert.rejects(rpc(a.user,'complete_sale',[sale(p.id,2),key]),/IDEMPOTENCY_CONFLICT/);
});
test('AT-23: injected failure after first movement rolls back header/items/balances/request/counter',async()=>{
 const a=await base(),p=await product(a,'A'),q=await product(a,'B');
 await pool.query(`create function public.test_fail_movement() returns trigger language plpgsql as $$ begin if new.product_id='${q.id}'::uuid then raise exception 'INJECTED_FAILURE'; end if; return new; end $$; create trigger test_failure before insert on public.stock_movements for each row execute function public.test_fail_movement()`);
 try {await assert.rejects(rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:p.id,quantity:2,unit_cost_paisa:'100'},{product_id:q.id,quantity:2,unit_cost_paisa:'100'}]),uid(),true]),/INJECTED_FAILURE/);
 assert.equal(await balance(a.user,p.id),0);assert.equal((await asOwner(a.user,'select * from public.purchases')).length,0);assert.equal((await asOwner<{next_purchase_number:string}>(a.user,'select next_purchase_number from public.stores'))[0].next_purchase_number,'1');
 } finally {await pool.query('drop trigger test_failure on public.stock_movements;drop function public.test_fail_movement()');}
});
test('AT-37/38: direct stock/document writes blocked; all balances reconstruct from ledger',async()=>{
 const a=await base(),p=await product(a);await rpc(a.user,'write_purchase',[purchase(a.supplier,[{product_id:p.id,quantity:2,unit_cost_paisa:'100'}]),uid(),true]);
 for(const table of ['inventory_balances','stock_movements','purchases','purchase_items','sales','sale_items']) await assert.rejects(asOwner(a.user,`delete from public.${table}`),/permission denied/);
 const mismatches=await pool.query('select b.product_id from public.inventory_balances b left join public.stock_movements m using(product_id) group by b.product_id,b.quantity having b.quantity<>coalesce(sum(m.quantity_delta),0)');assert.equal(mismatches.rowCount,0);
 const broken=await pool.query('select * from (select product_id,quantity_before,lag(quantity_after,1,0) over(partition by product_id order by sequence) previous from public.stock_movements) t where quantity_before<>previous');assert.equal(broken.rowCount,0);
});
