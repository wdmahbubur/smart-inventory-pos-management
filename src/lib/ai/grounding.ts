import {AppError} from '../errors';
import {money} from '../money';
import {outputSchema,selectionSchema,type InventoryFacts,type Language,type InsightPolicy,type InsightOutput,type InsightSelection,type StoredInsight,type InsightContext,type DeliveredInsight} from './contracts';
export function buildPolicy(facts:InventoryFacts,language:Language):InsightPolicy{
 const bn=language==='bn';
 const factMap:InsightPolicy['factMap']={
  active_count:{label:'Active products',value:String(facts.inventory.active_count),kind:'number'},in_stock:{label:'In stock',value:String(facts.inventory.in_stock),kind:'number'},low_stock:{label:'Low stock',value:String(facts.inventory.low_stock),kind:'number'},out_of_stock:{label:'Out of stock',value:String(facts.inventory.out_of_stock),kind:'number'},attention_count:{label:'Products to review',value:String(facts.inventory.attention_count),kind:'number'},inventory_value:{label:'Reference-cost estimate',value:facts.inventory.value_paisa,kind:'money'},
  sales_count:{label:'Completed sales today',value:String(facts.sales.count),kind:'number'},net_sales:{label:'Net sales today',value:facts.sales.total_paisa,kind:'money'},discounts:{label:'Order discounts today',value:facts.sales.discount_paisa??'0',kind:'money'},units_sold:{label:'Selling units sold today',value:String(facts.sales.units),kind:'number'},purchase_count:{label:'Received purchases today',value:String(facts.purchases.count),kind:'number'},received_value:{label:'Received value today',value:facts.purchases.total_paisa,kind:'money'},units_received:{label:'Selling units received today',value:String(facts.purchases.units),kind:'number'}
 };
 if(facts.highest_category){factMap.highest_category={label:'Highest-value category',value:facts.highest_category.name,kind:'text'};factMap.highest_category_value={label:'Highest category estimate',value:facts.highest_category.value_paisa,kind:'money'};}
 const summaries={
  overview:bn?'Business snapshot: {{active_count}}টি active product-এর reference-cost stock estimate {{inventory_value}}। নিচের decision cards থেকে stock, sales ও purchase activity অনুযায়ী পরবর্তী কাজ খুলতে পারবেন।':'Business snapshot: {{active_count}} active products carry a current reference-cost stock estimate of {{inventory_value}}. Use the decision cards below to open the next stock, sales or purchasing task.',
  attention:bn?'আজকের অগ্রাধিকার: {{attention_count}}টি product review করুন—{{out_of_stock}}টি out of stock এবং {{low_stock}}টি minimum-এর নিচে। Replenishment action থেকে suggested gap খুলে supplier ও quantity confirm করুন।':'Today’s priority: review {{attention_count}} products—{{out_of_stock}} are out of stock and {{low_stock}} are below minimum. Open the replenishment action, then confirm supplier and quantities before receiving.',
  activity:bn?'আজকের trading pulse: {{sales_count}}টি completed sale থেকে net sales {{net_sales}} এবং {{purchase_count}}টি received purchase-এর recorded value {{received_value}}। Sales report ও purchase report থেকে detail review করুন; এই দুই অঙ্কের পার্থক্য profit নয়।':'Today’s trading pulse: {{sales_count}} completed sales total {{net_sales}} net, while {{purchase_count}} received purchases total {{received_value}}. Review the sales and purchase reports for detail; the difference is not profit.'
 };
 const sections:InsightPolicy['sections']={
  stock:{heading:bn?'Replenishment priority':'Replenishment priority',explanation:bn?'{{attention_count}}টি product-এর মধ্যে {{out_of_stock}}টির stock শূন্য এবং {{low_stock}}টি minimum-এর নিচে। Decision card থেকে purchase prefill খুলে supplier, cost ও quantity review করুন। Suggested quantity শুধু minimum gap; এটি demand forecast নয়।':'Among {{attention_count}} products to review, {{out_of_stock}} are at zero and {{low_stock}} are below minimum. Open the replenishment action to review supplier, cost and quantity. Suggested quantity is only the minimum gap, not a demand forecast.',fact_ids:['attention_count','low_stock','out_of_stock']},
  activity:{heading:bn?'আজকের trading pulse':'Today’s trading pulse',explanation:bn?'{{sales_count}}টি completed sale-এর net sales {{net_sales}}; order discount {{discounts}}। {{purchase_count}}টি received purchase-এর value {{received_value}}। Report action থেকে detail দেখুন; draft purchase ও cash tender revenue হিসেবে ধরা হয়নি।':'{{sales_count}} completed sales produced {{net_sales}} in net sales after {{discounts}} in order discounts. {{purchase_count}} received purchases total {{received_value}}. Open the report actions for detail; drafts are excluded and cash tender is not revenue.',fact_ids:['sales_count','net_sales','discounts','purchase_count','received_value']}
 };
 if(facts.highest_category)sections.category={heading:bn?'Inventory value concentration':'Inventory value concentration',explanation:bn?'Reference cost অনুযায়ী {{highest_category}} category-তে সর্বোচ্চ estimate {{highest_category_value}}; সব active product-এর estimate {{inventory_value}}। Inventory report থেকে mix review করুন। এটি accounting valuation বা profit নয়।':'{{highest_category}} has the highest current reference-cost estimate at {{highest_category_value}}, versus {{inventory_value}} across all active products. Open the inventory report to review the mix. This is not accounting valuation or profit.',fact_ids:['highest_category','highest_category_value','inventory_value']};
 return {summaries,sections,factMap};
}
function sameIds(left:string[],right:string[]){return left.length===right.length&&new Set(left).size===left.length&&left.every(id=>right.includes(id));}
export function validateOutput(raw:unknown,policy:InsightPolicy):InsightSelection{
 if(JSON.stringify(raw).length>16_000)throw new AppError('AI_INVALID_OUTPUT');
 const parsed=outputSchema.safeParse(raw);if(!parsed.success)throw new AppError('AI_INVALID_OUTPUT');
 const output=parsed.data;
 const summary=Object.entries(policy.summaries).find(([,text])=>text===output.summary)?.[0];
 if(!summary)throw new AppError('AI_INVALID_OUTPUT');
 const sectionKeys:string[]=[];
 for(const section of output.sections){const entry=Object.entries(policy.sections).find(([,allowed])=>allowed&&allowed.heading===section.heading&&allowed.explanation===section.explanation&&sameIds(allowed.fact_ids,section.fact_ids));if(!entry)throw new AppError('AI_INVALID_OUTPUT');sectionKeys.push(entry[0]);}
 const selection=selectionSchema.safeParse({summary_key:summary,section_keys:sectionKeys});if(!selection.success)throw new AppError('AI_INVALID_OUTPUT');
 return selection.data;
}
export function expandSelection(selection:InsightSelection,policy:InsightPolicy):InsightOutput{
 const parsed=selectionSchema.parse(selection);
 return {summary:policy.summaries[parsed.summary_key],sections:parsed.section_keys.map(key=>{const section=policy.sections[key];if(!section)throw new AppError('AI_INVALID_OUTPUT');return section;})};
}
export function resolveFacts(text:string,policy:InsightPolicy,language:Language):string{
 return text.replace(/\{\{([a-z_]+)\}\}/g,(_,id:string)=>{const fact=policy.factMap[id];if(!fact)throw new AppError('AI_INVALID_OUTPUT');const value=fact.kind==='money'?money(fact.value):fact.value;return language==='bn'&&fact.kind!=='text'?value.replace(/[0-9]/g,d=>String.fromCharCode(0x09e6+Number(d))):value;});
}
export function deliverInsight(stored:StoredInsight,current:InsightContext):DeliveredInsight{
 const policy=buildPolicy(stored.facts_snapshot,stored.language),output=expandSelection(stored.content,policy);
 return {...stored,output:{summary:resolveFacts(output.summary,policy,stored.language),sections:output.sections.map(section=>({...section,explanation:resolveFacts(section.explanation,policy,stored.language)}))},stale:stored.store_data_revision!==current.facts.data_revision||stored.business_date!==current.facts.business_date||stored.facts_hash!==current.facts_hash};
}
