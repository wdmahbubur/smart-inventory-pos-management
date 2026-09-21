import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { pool, base, product, rpc, uid, purchase, sale, today, owner } from './helpers';
after(()=>pool.end());
test('read models: zero stock, pagination, exact estimate and draft exclusion',async()=>{
 const c=await base(); const p=await product(c,'READ-COKE');
 let w=await rpc<{inventory:{value_paisa:string;out_of_stock:number};purchases:{total_paisa:string}}>(c.user,'get_workspace',[]);
 assert.equal(w.inventory.value_paisa,'0'); assert.equal(w.inventory.out_of_stock,1);
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:20,unit_cost_paisa:'7000'}]),uid(),false]);
 w=await rpc(c.user,'get_workspace',[]); assert.equal(w.purchases.total_paisa,'0');
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:20,unit_cost_paisa:'6000'}]),uid(),true]);
 w=await rpc(c.user,'get_workspace',[]); assert.equal(w.inventory.value_paisa,'140000'); assert.equal(w.purchases.total_paisa,'120000');
 const list=await rpc<{total:number;rows:{quantity:number;selling_price_paisa:string}[]}>(c.user,'list_catalog',['products',{}]); assert.equal(list.total,1); assert.equal(list.rows[0].quantity,20); assert.equal(list.rows[0].selling_price_paisa,'10000');
 const docs=await rpc<{total:number;received_count:number;draft_count:number;total_paisa:string}>(c.user,'list_documents',['purchases',{}]);assert.equal(docs.total,2);assert.equal(docs.received_count,1);assert.equal(docs.draft_count,1);assert.equal(docs.total_paisa,'120000');
});
test('reports reconcile gross, discount, net and one exported discount per order',async()=>{
 const c=await base();const a=await product(c,'REPORT-A'),b=await product(c,'REPORT-B','5000','3000');
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:a.id,quantity:5,unit_cost_paisa:'7000'},{product_id:b.id,quantity:5,unit_cost_paisa:'3000'}]),uid(),true]);
 await rpc(c.user,'complete_sale',[{items:[...sale(a.id,2).items,...sale(b.id,3,'5000').items],discount_paisa:'2000',cash_received_paisa:'50000'},uid()]);
 const workspace=await rpc<{sales:{cogs_paisa:string;net_profit_paisa:string}}>(c.user,'get_workspace',[]);assert.equal(workspace.sales.cogs_paisa,'23000');assert.equal(workspace.sales.net_profit_paisa,'10000');
 const r=await rpc<{summary:{total_paisa:string;subtotal_paisa:string;discount_paisa:string;cogs_paisa:string;net_profit_paisa:string};source_rows:{order_discount_paisa:string|null;net_profit_contribution_paisa:string}[]}>(c.user,'get_report',['sales',{from:today(),to:today()},true]);
 assert.equal(r.summary.total_paisa,'33000');assert.equal(r.summary.subtotal_paisa,'35000');assert.equal(r.summary.discount_paisa,'2000');assert.equal(r.summary.cogs_paisa,'23000');assert.equal(r.summary.net_profit_paisa,'10000');assert.deepEqual(r.source_rows.map(x=>x.order_discount_paisa),['2000',null]);assert.equal(r.source_rows.reduce((sum,row)=>sum+BigInt(row.net_profit_contribution_paisa),0n),10000n);
 await rpc(c.user,'catalog_mutate',['product','save',{...a.payload,id:a.id,expected_version:a.version,reference_cost_paisa:'9000'},uid()]);
 const stable=await rpc<{summary:{cogs_paisa:string;net_profit_paisa:string}}>(c.user,'get_report',['sales',{from:today(),to:today()},false]);assert.equal(stable.summary.cogs_paisa,'23000');assert.equal(stable.summary.net_profit_paisa,'10000');
});
test('all read models isolate another owner and reject unbounded date ranges',async()=>{
 const c=await base();const p=await product(c);const other=await owner();
 await assert.rejects(rpc(other,'get_entity',['products',p.id]),/NOT_FOUND/);
 const list=await rpc<{total:number}>(other,'list_catalog',['products',{}]);assert.equal(list.total,0);
 const report=await rpc<{source_count:number}>(other,'get_report',['inventory',{},true]);assert.equal(report.source_count,0);
 await assert.rejects(rpc(c.user,'get_report',['sales',{from:'2020-01-01',to:'2026-09-19'},false]),/DATE_RANGE_LIMIT/);
 await assert.rejects(rpc(c.user,'list_catalog',['products',{size:1000}]),/VALIDATION_ERROR/);
});
