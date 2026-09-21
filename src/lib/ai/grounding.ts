import {AppError} from '../errors';
import {money} from '../money';
import {outputSchema,selectionSchema,type InventoryFacts,type Language,type InsightPolicy,type InsightOutput,type InsightSelection,type StoredInsight,type InsightContext,type DeliveredInsight,type ProductForecastSignal} from './contracts';

function first<T>(items:T[]):T|undefined{return items[0];}
function addProductFacts(map:InsightPolicy['factMap'],prefix:string,item:ProductForecastSignal|undefined){
 if(!item)return;
 map[`${prefix}_name`]={label:`${prefix} product`,value:item.name,kind:'text'};
 map[`${prefix}_units_30d`]={label:`${prefix} units sold in 30 days`,value:String(item.units_30d),kind:'number'};
 map[`${prefix}_forecast_7d`]={label:`${prefix} forecast next 7 days`,value:String(item.forecast_7d_units),kind:'number'};
 map[`${prefix}_trend_pct`]={label:`${prefix} recent trend percent`,value:String(item.trend_pct),kind:'number'};
 map[`${prefix}_stock`]={label:`${prefix} stock on hand`,value:String(item.quantity),kind:'number'};
 map[`${prefix}_restock`]={label:`${prefix} suggested restock`,value:String(item.suggested_restock_qty),kind:'number'};
 map[`${prefix}_days_without_sale`]={label:`${prefix} days without sale`,value:String(item.days_without_sale??0),kind:'number'};
 map[`${prefix}_discount_pct`]={label:`${prefix} suggested test discount percent`,value:String(item.discount_opportunity_pct),kind:'number'};
 map[`${prefix}_discount_profit`]={label:`${prefix} estimated unit profit after test discount`,value:item.discounted_unit_profit_paisa,kind:'money'};
 map[`${prefix}_profit_30d`]={label:`${prefix} estimated product profit 30 days`,value:item.profit_30d_paisa,kind:'money'};
}

export function buildPolicy(facts:InventoryFacts,language:Language):InsightPolicy{
 const bn=language==='bn',f=facts.forecast;
 const top=first(f.top_sellers),restock=first(f.restock_candidates),discount=first(f.discount_candidates),stale=first(f.stagnant_products),profit=first(f.profit_leaders);
 const factMap:InsightPolicy['factMap']={
  predicted_units_7d:{label:'Predicted units next 7 days',value:String(f.predicted_units_7d),kind:'number'},
  total_units_30d:{label:'Units sold last 30 days',value:String(f.total_units_30d),kind:'number'},
  weekday_factor:{label:'Weekday demand factor',value:String(f.weekday_factor),kind:'number'},
  net_profit_today:{label:'Net profit today',value:facts.sales.net_profit_paisa??'0',kind:'money'}
 };
 addProductFacts(factMap,'top',top);addProductFacts(factMap,'restock',restock);addProductFacts(factMap,'discount',discount);addProductFacts(factMap,'stagnant',stale);addProductFacts(factMap,'profit',profit);
 const summaries:InsightPolicy['summaries']={
  growth:bn?'আগামী ৭ দিনের projected demand {{predicted_units_7d}} selling unit। Historical velocity, recent trend এবং weekday pattern মিলিয়ে growth opportunity-গুলো priority দিন; forecast guarantee নয়।':'Projected demand for the next 7 days is {{predicted_units_7d}} selling units. Prioritize growth opportunities using historical velocity, recent trend and weekday pattern; this forecast is not a guarantee.',
  inventory:bn?'Demand forecast-এর সাথে stock cover মিলিয়ে replenishment করুন। অতিরিক্ত stock এবং stockout—দুই ঝুঁকিই কমাতে suggested restock quantity review করুন।':'Match stock cover to the demand forecast before replenishing. Review suggested quantities to reduce both overstock and stockout risk.',
  margin:bn?'Profit বাড়াতে শুধু sales volume নয়, margin এবং slow-moving stock একসাথে দেখুন। Discount suggestion demand guarantee নয়; margin headroom রেখে test করার জন্য।':'To improve profit, consider margin and slow-moving stock alongside sales volume. Discount suggestions are test ideas, not demand guarantees, and retain estimated margin headroom.'
 };
 const sections:InsightPolicy['sections']={};
 if(top)sections.demand={heading:bn?'Demand forecast':'Demand forecast',explanation:bn?'{{top_name}} গত ৩০ দিনে {{top_units_30d}} unit বিক্রি হয়েছে এবং recent trend {{top_trend_pct}}%। Model আগামী ৭ দিনে প্রায় {{top_forecast_7d}} unit demand project করছে।':'{{top_name}} sold {{top_units_30d}} units in the last 30 days with a recent trend of {{top_trend_pct}}%. The model projects about {{top_forecast_7d}} units of demand over the next 7 days.',fact_ids:['top_name','top_units_30d','top_trend_pct','top_forecast_7d']};
 if(restock)sections.restock={heading:bn?'Stock বাড়ানোর suggestion':'Restock suggestion',explanation:bn?'{{restock_name}}-এর current stock {{restock_stock}} unit। Forecast এবং ১৪ দিনের safety target ধরে suggested restock প্রায় {{restock_restock}} unit।':'{{restock_name}} currently has {{restock_stock}} units. Based on forecast demand and a 14-day safety target, suggested replenishment is about {{restock_restock}} units.',fact_ids:['restock_name','restock_stock','restock_restock','restock_forecast_7d']};
 if(discount)sections.discount={heading:bn?'Discount test opportunity':'Discount test opportunity',explanation:bn?'{{discount_name}} {{discount_days_without_sale}} দিন sale ছাড়া আছে। {{discount_discount_pct}}% test discount-এর পর current reference cost ধরে estimated unit profit {{discount_discount_profit}} থাকবে। Demand response নিশ্চিত নয়।':'{{discount_name}} has gone {{discount_days_without_sale}} days without a sale. After a {{discount_discount_pct}}% test discount, estimated unit profit remains {{discount_discount_profit}} using current reference cost. Demand response is not guaranteed.',fact_ids:['discount_name','discount_days_without_sale','discount_discount_pct','discount_discount_profit']};
 if(stale)sections.stagnant={heading:bn?'Slow-moving stock':'Slow-moving stock',explanation:bn?'{{stagnant_name}}-এ {{stagnant_stock}} unit stock আছে এবং {{stagnant_days_without_sale}} দিন sale হয়নি। Reorder pause, merchandising বা controlled promotion test করুন।':'{{stagnant_name}} has {{stagnant_stock}} units on hand and no sale for {{stagnant_days_without_sale}} days. Consider pausing reorder and testing merchandising or a controlled promotion.',fact_ids:['stagnant_name','stagnant_stock','stagnant_days_without_sale']};
 if(profit)sections.profit={heading:bn?'Profit leader':'Profit leader',explanation:bn?'{{profit_name}} গত ৩০ দিনে estimated product profit {{profit_profit_30d}} দিয়েছে। Demand এবং margin দুটোই ধরে এই product-এর availability protect করা profit growth-এর জন্য গুরুত্বপূর্ণ।':'{{profit_name}} generated an estimated {{profit_profit_30d}} in product profit over the last 30 days. Protecting availability while demand and margin remain healthy can support profit growth.',fact_ids:['profit_name','profit_profit_30d','profit_forecast_7d']};
 return {summaries,sections,factMap};
}

function sameIds(left:string[],right:string[]){return left.length===right.length&&new Set(left).size===left.length&&left.every(id=>right.includes(id));}
export function validateOutput(raw:unknown,policy:InsightPolicy):InsightSelection{
 if(JSON.stringify(raw).length>18_000)throw new AppError('AI_INVALID_OUTPUT');
 const direct=selectionSchema.safeParse(raw);
 if(direct.success&&direct.data.section_keys.every(key=>Boolean(policy.sections[key])))return direct.data;
 const parsed=outputSchema.safeParse(raw);if(!parsed.success)throw new AppError('AI_INVALID_OUTPUT');
 const output=parsed.data,summary=Object.entries(policy.summaries).find(([,text])=>text===output.summary)?.[0];
 if(!summary)throw new AppError('AI_INVALID_OUTPUT');
 const sectionKeys:string[]=[];
 for(const section of output.sections){
  const entry=Object.entries(policy.sections).find(([,allowed])=>allowed&&allowed.heading===section.heading&&allowed.explanation===section.explanation&&sameIds(allowed.fact_ids,section.fact_ids));
  if(!entry)throw new AppError('AI_INVALID_OUTPUT');
  sectionKeys.push(entry[0]);
 }
 const selection=selectionSchema.safeParse({summary_key:summary,section_keys:sectionKeys});if(!selection.success||!selection.data.section_keys.every(key=>Boolean(policy.sections[key])))throw new AppError('AI_INVALID_OUTPUT');
 return selection.data;
}
export function expandSelection(selection:InsightSelection,policy:InsightPolicy):InsightOutput{
 const parsed=selectionSchema.parse(selection);
 return {summary:policy.summaries[parsed.summary_key],sections:parsed.section_keys.map(key=>{const section=policy.sections[key];if(!section)throw new AppError('AI_INVALID_OUTPUT');return section;})};
}
export function resolveFacts(text:string,policy:InsightPolicy,language:Language):string{
 return text.replace(/\{\{([a-z0-9_]+)\}\}/g,(_,id:string)=>{const fact=policy.factMap[id];if(!fact)throw new AppError('AI_INVALID_OUTPUT');const value=fact.kind==='money'?money(fact.value):fact.value;return language==='bn'&&fact.kind!=='text'?value.replace(/[0-9]/g,d=>String.fromCharCode(0x09e6+Number(d))):value;});
}
export function deliverInsight(stored:StoredInsight,current:InsightContext):DeliveredInsight{
 const policy=buildPolicy(stored.facts_snapshot,stored.language),output=expandSelection(stored.content,policy);
 return {...stored,output:{summary:resolveFacts(output.summary,policy,stored.language),sections:output.sections.map(section=>({...section,explanation:resolveFacts(section.explanation,policy,stored.language)}))},stale:stored.store_data_revision!==current.facts.data_revision||stored.business_date!==current.facts.business_date||stored.facts_hash!==current.facts_hash};
}
