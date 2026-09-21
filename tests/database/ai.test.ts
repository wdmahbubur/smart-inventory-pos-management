import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,base,rpc,owner,uid,product,purchase,sale} from './helpers';
import type {InsightContext,StoredInsight} from '../../src/lib/ai/contracts';
after(()=>pool.end());
type Begin={cached:boolean;lease_id:string;context:InsightContext;insight?:StoredInsight};
const args=['bn','gemini','contract-test-no-provider-call','inventory-suggestions-v2',true,10];

test('AI suggestion facts are owner-scoped and include bounded demand forecasts',async()=>{
 const c=await base();const p=await product(c,'FORECAST-A');
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:12,unit_cost_paisa:'7000'}]),uid(),true]);
 await rpc(c.user,'complete_sale',[sale(p.id,3),uid()]);
 const context=await rpc<InsightContext>(c.user,'get_insight_context',[]);
 assert.equal(context.facts.schema_version,'inventory-facts-v2');
 assert.equal(context.facts.inventory.active_count,1);
 assert.equal(context.facts.forecast.top_sellers[0].id,p.id);
 assert.equal(context.facts.forecast.top_sellers[0].units_30d,3);
 assert.ok(context.facts.forecast.top_sellers[0].forecast_7d_units>=1);
 assert.equal('store'in context.facts,false);assert.equal('profile'in context.facts,false);
 const other=await owner();const empty=await rpc<InsightContext>(other,'get_insight_context',[]);
 assert.equal(empty.facts.inventory.active_count,0);assert.equal(empty.facts.forecast.top_sellers.length,0);
});

test('concurrent AI begin calls share one durable lease and consume one allowance',async()=>{
 const c=await base();
 const results=await Promise.allSettled([rpc<Begin>(c.user,'begin_insight',args),rpc<Begin>(c.user,'begin_insight',args)]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 const good=results.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<Begin>;
 const count=await pool.query('select request_count from private.ai_request_windows w join public.stores s on s.id=w.store_id where s.owner_user_id=$1',[c.user]);
 assert.equal(count.rows[0].request_count,1);await rpc(c.user,'release_insight_lease',[good.value.lease_id]);
});

test('AI persistence accepts only grounded suggestion keys, caches exact revision and never changes stock',async()=>{
 const c=await base();const p=await product(c,'GROUND-A');
 await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:5,unit_cost_paisa:'7000'}]),uid(),true]);
 await rpc(c.user,'complete_sale',[sale(p.id,1),uid()]);
 const before=await rpc<InsightContext>(c.user,'get_insight_context',[]);
 const begun=await rpc<Begin>(c.user,'begin_insight',args);
 await assert.rejects(rpc(c.user,'finish_insight',[begun.lease_id,{summary_key:'growth',section_keys:['execute_sql']}]),/AI_INVALID_OUTPUT/);
 await assert.rejects(rpc(c.user,'finish_insight',[begun.lease_id,{summary_key:'growth',section_keys:['demand'],quantity:99}]),/VALIDATION_ERROR/);
 const saved=await rpc<StoredInsight>(c.user,'finish_insight',[begun.lease_id,{summary_key:'growth',section_keys:['demand','profit']}]);
 assert.equal(saved.store_data_revision,before.facts.data_revision);
 const afterContext=await rpc<InsightContext>(c.user,'get_insight_context',[]);assert.equal(afterContext.facts_hash,before.facts_hash);
 const cached=await rpc<Begin>(c.user,'begin_insight',['bn','gemini','contract-test-no-provider-call','inventory-suggestions-v2',false,10]);
 assert.equal(cached.cached,true);assert.equal(cached.insight?.id,saved.id);
 const other=await owner();assert.equal(await rpc(other,'latest_insight',['bn']),null);
 await assert.rejects(rpc(other,'finish_insight',[uid(),{summary_key:'growth',section_keys:['demand']}]),/AI_TIMEOUT/);
});

test('AI quota is bounded across new server calls and cannot be raised through the RPC',async()=>{
 const c=await base();for(let i=0;i<10;i++){const begin=await rpc<Begin>(c.user,'begin_insight',args);await rpc(c.user,'release_insight_lease',[begin.lease_id]);}
 await assert.rejects(rpc(c.user,'begin_insight',args),/AI_RATE_LIMITED/);
 await assert.rejects(rpc(c.user,'begin_insight',['en','gemini','contract-test','inventory-suggestions-v2',true,100]),/VALIDATION_ERROR/);
});

test('OpenRouter Nemotron slug is accepted by the durable AI quota boundary',async()=>{
 const c=await base();await product(c);
 const begun=await rpc<Begin>(c.user,'begin_insight',['en','openrouter','nvidia/nemotron-3-ultra-550b-a55b:free','inventory-suggestions-v2',true,10]);
 assert.equal(begun.cached,false);assert.ok(begun.lease_id);await rpc(c.user,'release_insight_lease',[begun.lease_id]);
 await assert.rejects(rpc(c.user,'begin_insight',['en','unknown-provider','nvidia/nemotron-3-ultra-550b-a55b:free','inventory-suggestions-v2',true,10]),/VALIDATION_ERROR/);
});
