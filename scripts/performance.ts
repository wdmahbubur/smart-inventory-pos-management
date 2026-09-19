/** Synthetic, ledger-correct acceptance dataset. NEVER runs against a remote/live database. */
import {performance} from 'node:perf_hooks';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {pool,base,product,rpc,uid,purchase,sale,today} from '../tests/database/helpers';

const started=performance.now();
const count=1200,sourceLines=50000,samples=30;
const results:Record<string,unknown>={
 environment:'Isolated PostgreSQL over localhost; authenticated SQL role/JWT contexts. Not production HTTP or deployed same-region latency.',
 node:process.version,platform:process.platform,recorded_at:new Date().toISOString(),
 dataset:{active_products:count,received_source_lines:sourceLines,received_documents:sourceLines/100},samples,
};
async function measure(name:string,budgetMs:number,action:()=>Promise<unknown>){
 for(let i=0;i<3;i++)await action();
 const times:number[]=[];
 for(let i=0;i<samples;i++){const start=performance.now();await action();times.push(performance.now()-start);}
 times.sort((a,b)=>a-b);
 const p95=times[Math.ceil(times.length*.95)-1];
 results[name]={min_ms:+times[0].toFixed(2),p50_ms:+times[Math.floor(times.length*.5)].toFixed(2),p95_ms:+p95.toFixed(2),max_ms:+times.at(-1)!.toFixed(2),target_ms:budgetMs,met_in_this_environment:p95<budgetMs};
 console.log(JSON.stringify({event:'performance_measurement',name,...results[name] as object}));
}
try{
 const c=await base(),products:{id:string;version:number}[]=[];
 for(let i=0;i<count;i++)products.push(await product(c,`PERF-${String(i).padStart(4,'0')}`));
 for(let batch=0;batch<sourceLines/100;batch++){
  const items=Array.from({length:100},(_,i)=>({product_id:products[(batch*100+i)%count].id,quantity:1,unit_cost_paisa:'7000'}));
  await rpc(c.user,'write_purchase',[purchase(c.supplier,items),uid(),true]);
 }
 const w=await rpc<{inventory:{active_count:number;units:number;value_paisa:string}}>(c.user,'get_workspace',[]);
 assert.equal(w.inventory.active_count,count);assert.equal(w.inventory.units,sourceLines);assert.equal(w.inventory.value_paisa,String(BigInt(sourceLines)*7000n));
 const exported=await rpc<{source_count:number;source_rows:unknown[];summary:{units:number}}>(c.user,'get_report',['purchases',{from:today(),to:today()},true]);
 assert.equal(exported.source_count,sourceLines);assert.equal(exported.source_rows.length,sourceLines);assert.equal(exported.summary.units,sourceLines);
 const inventoryExport=await rpc<{source_count:number;source_rows:unknown[]}>(c.user,'get_report',['inventory',{},true]);
 assert.equal(inventoryExport.source_count,count);assert.equal(inventoryExport.source_rows.length,count);
 const seen=new Set<string>();
 for(let page=1;page<=count/100;page++){
  const result=await rpc<{rows:{id:string}[];total:number}>(c.user,'list_catalog',['products',{page,size:100}]);
  assert.equal(result.total,count);for(const row of result.rows){assert.ok(!seen.has(row.id));seen.add(row.id);}
 }
 assert.equal(seen.size,count);results.full_dataset_reconciliation='passed: 1,200 inventory export rows, 50,000 received source export rows, exact totals and all catalog pages';
 results.setup_ms=+(performance.now()-started).toFixed(2);
 await pool.query('analyze public.products; analyze public.inventory_balances; analyze public.purchase_items; analyze public.purchases; analyze public.stock_movements');
 await measure('catalog_page',800,()=>rpc(c.user,'list_catalog',['products',{page:5,size:20}]));
 await measure('workspace_aggregates',800,()=>rpc(c.user,'get_workspace',[]));
 await measure('purchase_report_aggregate',800,()=>rpc(c.user,'get_report',['purchases',{from:today(),to:today()},false]));
 await measure('movement_page',800,()=>rpc(c.user,'list_documents',['movements',{page:2,size:20}]));
 const items=products.slice(0,20).map(p=>({product_id:p.id,quantity:1,unit_cost_paisa:'7000'}));
 await measure('twenty_line_receipt',1500,()=>rpc(c.user,'write_purchase',[purchase(c.supplier,items),uid(),true]));
 const cart={items:products.slice(0,20).flatMap(p=>sale(p.id).items),discount_paisa:'0',cash_received_paisa:'200000'};
 await measure('twenty_line_checkout',1500,()=>rpc(c.user,'complete_sale',[cart,uid()]));
 const bad=await pool.query(`select b.product_id from public.inventory_balances b join public.stores s on s.id=b.store_id left join public.stock_movements m on m.product_id=b.product_id where s.owner_user_id=$1 group by b.product_id,b.quantity having b.quantity<>coalesce(sum(m.quantity_delta),0)`,[c.user]);
 assert.equal(bad.rowCount,0);
 const broken=await pool.query(`select * from (select m.quantity_before,lag(m.quantity_after,1,0) over(partition by m.product_id order by m.sequence) previous from public.stock_movements m join public.stores s on s.id=m.store_id where s.owner_user_id=$1) x where quantity_before<>previous`,[c.user]);
 assert.equal(broken.rowCount,0);results.ledger_after_benchmark='passed: every balance and before/after chain reconstructs from zero';
 results.postgres=(await pool.query('select version() v')).rows[0].v;
 await mkdir('test-results',{recursive:true});await writeFile('test-results/performance.json',JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify({event:'synthetic_performance_complete',duration_ms:Math.round(performance.now()-started),report:'test-results/performance.json'}));
}finally{await pool.end();}
