import {unitFacts} from './facts';
import type {PredictionContext,PredictionFacts,PredictionOutput,SavedPrediction} from '../../src/lib/ai/prediction-contracts';
export const predictionProductId='00000000-0000-4000-8000-000000000001';
export function predictionFacts():PredictionFacts{
 const base=unitFacts();
 return {
  schema_version:'prediction-facts-v3',snapshot_at:'2026-10-02T06:00:00Z',business_date:'2026-10-02',timezone:'Asia/Dhaka',currency:'BDT',data_revision:'80',history_from:'2026-08-07',history_to:'2026-10-01',history_days:56,horizon_days:7,
  total_products:1,products_truncated:false,inventory:base.inventory,sales_today:base.sales,
  external_context:{weather:'not_available',local_events:'not_available',competitor_prices:'not_available',supplier_lead_times:'not_available'},
  products:[{id:predictionProductId,name:'Demo beverage',sku:'DEMO-A',unit:'bottle',quantity:8,minimum_stock:10,selling_price_paisa:'10000',reference_cost_paisa:'7000',units_7d:35,units_prev_7d:28,units_30d:95,units_today:2,active_sale_days_30d:30,observed_days:56,days_without_sale:0,last_sale_at:'2026-10-02T04:00:00Z',daily_units:Array.from({length:56},(_,i)=>i>=49?5:i>=42?4:2)}]
 };
}
/** Deliberately not a selection key or a copy of a deterministic forecast. */
export function predictionOutput(id=predictionProductId):PredictionOutput{
 return {
  summary:'Recent beverage sales suggest replenishing cautiously while checking the next week of demand.',
  predictions:[{product_id:id,expected_units_7d:43,low_units_7d:24,high_units_7d:58,confidence:'medium',explanation:'Recent daily sales have increased. I estimate higher demand next week, assuming current prices and similar trading conditions.',evidence:['daily_sales_history','sales_last_7_days']}],
  suggestions:[{product_id:id,action:'restock',priority:'high',title:'Replenish the beverage in a small first batch',explanation:'Stock on hand may be insufficient for my next-week estimate. Review an order of 40 bottles, assuming the supplier can deliver promptly.',expected_impact:'May reduce missed sales without committing to a large purchase.',reorder_quantity:40,discount_percent:null,evidence:['current_stock','sales_last_7_days']}],
  assumptions:['Prices and opening hours stay unchanged.'],limitations:['The ranges are judgment-based estimates. Weather, local events and supplier lead time are unknown.']
 };
}
export function predictionContext():PredictionContext{return {facts:predictionFacts(),facts_hash:'fixture-hash-v3'};}
export function savedPrediction(output=predictionOutput()):SavedPrediction{
 const context=predictionContext();
 return {id:'10000000-0000-4000-8000-000000000001',language:'en',provider:'openrouter',model:'apodex/apodex-1.1-mini:free',prompt_version:'inventory-predictions-v3',facts_hash:context.facts_hash,store_data_revision:context.facts.data_revision,business_date:context.facts.business_date,facts_snapshot:context.facts,generated_at:'2026-10-02T06:01:00Z',content:{schema_version:'ai-prediction-v3',output,provider_response_id:'test-provider-response-1',response_model:'apodex/apodex-1.1-mini'}};
}
