import {test,after} from 'node:test';
import assert from 'node:assert/strict';
import {pool,base,owner,product,purchase,sale,rpc,uid} from './helpers';
import {predictionOutput} from '../fixtures/predictions';
import type {PredictionContext,SavedPrediction} from '../../src/lib/ai/prediction-contracts';
after(()=>pool.end());
type Begin={lease_id:string;context:PredictionContext};
const args=['en','openrouter','apodex/apodex-1.1-mini:free','inventory-predictions-v3',10];
async function stockAndSale(){const c=await base(),p=await product(c,'AI-PRED-'+uid().slice(0,6));await rpc(c.user,'write_purchase',[purchase(c.supplier,[{product_id:p.id,quantity:20,unit_cost_paisa:'7000'}]),uid(),true]);await rpc(c.user,'complete_sale',[sale(p.id,2),uid()]);return {c,p};}

test('prediction input contains raw zero-filled complete-day sales, separates partial today, and excludes personal data',async()=>{
 const {c,p}=await stockAndSale();const context=await rpc<PredictionContext>(c.user,'get_prediction_context',[]);
 const row=context.facts.products[0];assert.equal(row.id,p.id);assert.equal(row.units_7d,0);assert.equal(row.units_today,2);assert.equal(row.daily_units.length,56);assert.ok(row.daily_units.every(n=>n===0));
 assert.equal(context.facts.schema_version,'prediction-facts-v3');assert.equal('forecast' in context.facts,false);assert.equal('store' in context.facts,false);assert.equal('profile' in context.facts,false);assert.ok(!JSON.stringify(context).includes('customer_phone'));
 assert.equal(context.facts.external_context.weather,'not_available');
 // Test-only clock on a disposable owner makes today's real postings a complete historical day.
 await pool.query("update public.stores set is_demo=true,demo_clock=((clock_timestamp() at time zone 'Asia/Dhaka')::date+1)::timestamp at time zone 'Asia/Dhaka' where owner_user_id=$1",[c.user]);
 const historical=await rpc<PredictionContext>(c.user,'get_prediction_context',[]);assert.equal(historical.facts.products[0].units_7d,2);assert.equal(historical.facts.products[0].daily_units[55],2);assert.equal(historical.facts.products[0].units_today,0);
 const other=await owner();assert.equal((await rpc<PredictionContext>(other,'get_prediction_context',[])).facts.products.length,0);
});
test('full predictions/prose persist unchanged, are readable on page load and cannot mutate inventory',async()=>{
 const {c,p}=await stockAndSale(),before=await rpc<PredictionContext>(c.user,'get_prediction_context',[]);
 const begun=await rpc<Begin>(c.user,'begin_prediction',args),output=predictionOutput(p.id);
 const saved=await rpc<SavedPrediction>(c.user,'finish_prediction',[begun.lease_id,output,'gen-fixture-1','apodex/apodex-1.1-mini']);
 assert.equal(saved.content.output.predictions[0].expected_units_7d,43);assert.equal(saved.content.output.suggestions[0].explanation,output.suggestions[0].explanation);assert.equal(saved.content.provider_response_id,'gen-fixture-1');
 const latest=await rpc<{insight:SavedPrediction}>(c.user,'latest_prediction',['en']);assert.equal(latest.insight.id,saved.id);
 assert.equal((await rpc<PredictionContext>(c.user,'get_prediction_context',[])).facts_hash,before.facts_hash);
 const other=await owner();assert.equal((await rpc<{insight:null}>(other,'latest_prediction',['en'])).insight,null);
});
test('repeat Generate never returns a cached insight and obtains a new lease for identical data',async()=>{
 const {c,p}=await stockAndSale();
 const first=await rpc<Begin>(c.user,'begin_prediction',args);await rpc(c.user,'finish_prediction',[first.lease_id,predictionOutput(p.id),'gen-one',null]);
 const second=await rpc<Begin & {cached?:boolean;insight?:unknown}>(c.user,'begin_prediction',args);
 assert.notEqual(second.lease_id,first.lease_id);assert.equal(second.cached,undefined);assert.equal(second.insight,undefined);assert.equal(second.context.facts_hash,first.context.facts_hash);
 await rpc(c.user,'release_insight_lease',[second.lease_id]);
});
test('database rejects foreign product IDs, invalid ranges, canned keys and unsafe discount output',async()=>{
 const {c,p}=await stockAndSale(),begin=await rpc<Begin>(c.user,'begin_prediction',args);
 await assert.rejects(rpc(c.user,'finish_prediction',[begin.lease_id,predictionOutput(uid()),null,null]),/AI_INVALID_OUTPUT/);
 const invalid=predictionOutput(p.id);invalid.predictions[0].low_units_7d=99;await assert.rejects(rpc(c.user,'finish_prediction',[begin.lease_id,invalid,null,null]),/AI_INVALID_OUTPUT/);
 await assert.rejects(rpc(c.user,'finish_prediction',[begin.lease_id,{summary_key:'growth',section_keys:['demand']},null,null]),/VALIDATION_ERROR/);
 const discount=predictionOutput(p.id);discount.suggestions[0].action='discount_test';discount.suggestions[0].reorder_quantity=null;discount.suggestions[0].discount_percent=30;
 await assert.rejects(rpc(c.user,'finish_prediction',[begin.lease_id,discount,null,null]),/AI_INVALID_OUTPUT/);
 discount.suggestions[0].discount_percent=10;await rpc(c.user,'finish_prediction',[begin.lease_id,discount,'gen-valid-discount',null]);
});
test('invalid new generation keeps the old saved prediction and tenant leases are isolated',async()=>{
 const {c,p}=await stockAndSale();let begin=await rpc<Begin>(c.user,'begin_prediction',args);
 const saved=await rpc<SavedPrediction>(c.user,'finish_prediction',[begin.lease_id,predictionOutput(p.id),'gen-good',null]);
 begin=await rpc<Begin>(c.user,'begin_prediction',args);const other=await owner();await assert.rejects(rpc(other,'finish_prediction',[begin.lease_id,predictionOutput(p.id),'gen-spoof',null]),/AI_TIMEOUT/);
 const invalid=predictionOutput(p.id);invalid.suggestions[0].reorder_quantity=-5;
 await assert.rejects(rpc(c.user,'finish_prediction',[begin.lease_id,invalid,null,null]),/AI_INVALID_OUTPUT/);await rpc(c.user,'release_insight_lease',[begin.lease_id]);
 assert.equal((await rpc<{insight:SavedPrediction}>(c.user,'latest_prediction',['en'])).insight.id,saved.id);
});
test('new AI workflow preserves shared quota and blocks concurrent generation without cache fallback',async()=>{
 const c=await base();const begun=await Promise.allSettled([rpc<Begin>(c.user,'begin_prediction',args),rpc<Begin>(c.user,'begin_prediction',args)]);
 assert.equal(begun.filter(x=>x.status==='fulfilled').length,1);const winner=begun.find(x=>x.status==='fulfilled') as PromiseFulfilledResult<Begin>;await rpc(c.user,'release_insight_lease',[winner.value.lease_id]);
 for(let i=1;i<10;i++){const next=await rpc<Begin>(c.user,'begin_prediction',args);await rpc(c.user,'release_insight_lease',[next.lease_id]);}
 await assert.rejects(rpc(c.user,'begin_prediction',args),/AI_RATE_LIMITED/);
 await assert.rejects(rpc(c.user,'begin_prediction',[...args.slice(0,4),100]),/VALIDATION_ERROR/);
});
test('new result reader distinguishes legacy-only records without deleting or upgrading them as AI predictions',async()=>{
 const {c}=await stockAndSale();const begin=await rpc<Begin>(c.user,'begin_insight',['en','openrouter','fixture-model','inventory-suggestions-v2',true,10]);
 await rpc(c.user,'finish_insight',[begin.lease_id,{summary_key:'growth',section_keys:['demand']}]);
 const latest=await rpc<{insight:null;has_legacy_result:boolean}>(c.user,'latest_prediction',['en']);assert.equal(latest.insight,null);assert.equal(latest.has_legacy_result,true);
});
test('empty-store AI guidance can be saved and missing evidence is rejected',async()=>{
 const c=await base(),begin=await rpc<Begin>(c.user,'begin_prediction',args);const output=predictionOutput();output.predictions=[];output.suggestions[0]={...output.suggestions[0],action:'collect_data',product_id:null,reorder_quantity:null,evidence:['limited_history']};
 const bad=structuredClone(output);bad.suggestions[0].evidence=[];await assert.rejects(rpc(c.user,'finish_prediction',[begin.lease_id,bad,null,null]),/AI_INVALID_OUTPUT/);
 await rpc(c.user,'finish_prediction',[begin.lease_id,output,'gen-empty-store',null]);
});
test('prediction RPCs deny anonymous callers and private validation helpers stay private',async()=>{
 const c=await pool.connect();try{await c.query('set role anon');await assert.rejects(c.query('select public.get_prediction_context()'),/permission denied/);await assert.rejects(c.query("select public.latest_prediction('en')"),/permission denied/);await c.query('reset role');await c.query('set role authenticated');await assert.rejects(c.query("select private.validate_prediction('{}','{}')"),/permission denied/);}finally{await c.query('reset role');c.release();}
});
