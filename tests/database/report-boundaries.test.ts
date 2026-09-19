import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,base,product,rpc,uid,purchase,sale,today,balance} from './helpers';
after(()=>pool.end());

test('AT-43/44: varying captured costs and later reference edits preserve the complete ledger',async()=>{
 const c=await base(),p=await product(c,'VARIABLE-COST');
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:4,unit_cost_paisa:'6000'}]),uid(),true]);
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:6,unit_cost_paisa:'8000'}]),uid(),true]);
 const initial=await rpc<{summary:{total_paisa:string};rows:{min_cost_paisa:string;max_cost_paisa:string;quantity:number}[]}>(c.user,'get_report',['purchases',{from:today(),to:today()},false]);
 assert.equal(initial.summary.total_paisa,'72000');
 assert.deepEqual(initial.rows.map(r=>[r.min_cost_paisa,r.max_cost_paisa,r.quantity]),[['6000','8000',10]]);
 await rpc(c.user,'catalog_mutate',['product','save',{...p.payload,id:p.id,expected_version:1,reference_cost_paisa:'9000'},uid()]);
 const snapshot=await rpc<{inventory:{value_paisa:string}}>(c.user,'get_workspace',[]);
 assert.equal(snapshot.inventory.value_paisa,'90000');assert.equal(await balance(c.user,p.id),10);
 const unchanged=await rpc(c.user,'get_report',['purchases',{from:today(),to:today()},false]);
 assert.deepEqual(unchanged.summary,initial.summary);assert.deepEqual(unchanged.rows,initial.rows);
 const movements=await rpc<{total:number}>(c.user,'list_documents',['movements',{}]);assert.equal(movements.total,2);
});

test('AT-45: half-open Dhaka day boundaries include midnight and exclude the next midnight',async()=>{
 const c=await base(),p=await product(c,'MIDNIGHT');
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:3,unit_cost_paisa:'7000'}]),uid(),true]);
 const ids:string[]=[];
 for(let n=0;n<3;n++)ids.push((await rpc<{id:string}>(c.user,'complete_sale',[sale(p.id),uid()])).id);
 // Only a disposable test administrator can arrange historical event timestamps.
 // This is NOT exposed through the authenticated application or the database API.
 const db=await pool.connect();try{
  await db.query('begin');await db.query('alter table public.sales disable trigger immutable_sales');
  await db.query(`update public.sales set completed_at=x.at from (values ($1::uuid,'2026-08-31T17:59:59.999Z'::timestamptz),($2::uuid,'2026-08-31T18:00:00Z'::timestamptz),($3::uuid,'2026-09-01T18:00:00Z'::timestamptz)) x(id,at) where sales.id=x.id`,ids);
  await db.query('alter table public.sales enable trigger immutable_sales');await db.query('commit');
 }catch(e){await db.query('rollback');throw e;}finally{db.release();}
 const report=await rpc<{summary:{count:number;total_paisa:string};source_rows:{sale_id:string}[]}>(c.user,'get_report',['sales',{from:'2026-09-01',to:'2026-09-01'},true]);
 assert.equal(report.summary.count,1);assert.equal(report.summary.total_paisa,'10000');assert.deepEqual(report.source_rows.map(r=>r.sale_id),[ids[1]]);
 const history=await rpc<{total:number}>(c.user,'list_documents',['sales',{from:'2026-09-01',to:'2026-09-01'}]);assert.equal(history.total,1);
});

test('AT-48: stable tied-name pagination has no missing or repeated products',async()=>{
 const c=await base();
 for(let i=0;i<45;i++)await rpc(c.user,'catalog_mutate',['product','save',{name:'Same name',sku:`PAGE-${String(i).padStart(3,'0')}`,category_id:c.category,unit:'piece',reference_cost_paisa:'10',selling_price_paisa:'20',minimum_stock:0},uid()]);
 const collected:string[]=[];
 for(let page=1;page<=3;page++){
  const rows=await rpc<{total:number;rows:{id:string}[]}>(c.user,'list_catalog',['products',{q:'Same name',size:20,page,sort:'name_asc'}]);
  assert.equal(rows.total,45);collected.push(...rows.rows.map(r=>r.id));
 }
 assert.equal(collected.length,45);assert.equal(new Set(collected).size,45);
 const all=await rpc<{rows:{id:string}[]}>(c.user,'list_catalog',['products',{q:'Same name',size:100,sort:'name_asc'}]);
 assert.deepEqual(collected,all.rows.map(r=>r.id));
});
