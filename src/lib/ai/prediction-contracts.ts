import {z} from 'zod';
import type {ActivitySummary, InventorySummary} from '../domain';
import type {Language} from './contracts';

/** Historical observations only. No precomputed forecast or template choices go to the model. */
export interface PredictionProduct {
 id:string; name:string; sku:string; unit:string;
 quantity:number; minimum_stock:number;
 selling_price_paisa:string; reference_cost_paisa:string;
 units_7d:number; units_prev_7d:number; units_30d:number; units_today:number;
 active_sale_days_30d:number; observed_days:number;
 days_without_sale:number|null; last_sale_at:string|null;
 daily_units:number[];
}
export interface PredictionFacts {
 schema_version:'prediction-facts-v3'; snapshot_at:string; business_date:string;
 timezone:'Asia/Dhaka'; currency:'BDT'; data_revision:string;
 history_from:string; history_to:string; history_days:56; horizon_days:7;
 total_products:number; products_truncated:boolean; products:PredictionProduct[];
 inventory:InventorySummary; sales_today:ActivitySummary;
 external_context:{weather:'not_available'; local_events:'not_available'; competitor_prices:'not_available'; supplier_lead_times:'not_available'};
}
export interface PredictionContext {facts:PredictionFacts; facts_hash:string}
export const PREDICTION_PROMPT_VERSION='inventory-predictions-v3';
export const evidenceKeys=['sales_last_7_days','sales_previous_7_days','sales_last_30_days','daily_sales_history','current_stock','minimum_stock','price_and_reference_cost','days_since_last_sale','limited_history'] as const;
const text=(max:number)=>z.string().trim().min(1).max(max);
const units=z.number().int().min(0).max(1_000_000);
const evidence=z.array(z.enum(evidenceKeys)).min(1).max(5);
/** AI estimates are not required to equal a database heuristic. Bounds are safety/schema checks only. */
export const predictionOutputSchema=z.object({
 summary:text(900),
 predictions:z.array(z.object({
  product_id:z.uuid(), expected_units_7d:units, low_units_7d:units, high_units_7d:units,
  confidence:z.enum(['low','medium','high']), explanation:text(500), evidence
 }).strict()).max(12),
 suggestions:z.array(z.object({
  product_id:z.uuid().nullable(),
  action:z.enum(['restock','discount_test','promote','hold_reorder','protect_margin','collect_data']),
  priority:z.enum(['high','medium','low']), title:text(140), explanation:text(600), expected_impact:text(400),
  reorder_quantity:units.nullable(), discount_percent:z.number().int().min(1).max(30).nullable(), evidence
 }).strict()).min(1).max(8),
 assumptions:z.array(text(300)).min(1).max(5),
 limitations:z.array(text(300)).min(1).max(5)
}).strict();
export type PredictionOutput=z.infer<typeof predictionOutputSchema>;
export const predictionContentSchema=z.object({
 schema_version:z.literal('ai-prediction-v3'),
 output:predictionOutputSchema,
 provider_response_id:z.string().min(1).max(200).nullable(),
 response_model:z.string().min(1).max(160).nullable()
}).strict();
export type PredictionContent=z.infer<typeof predictionContentSchema>;
export interface SavedPrediction {
 id:string; language:Language; provider:string; model:string; prompt_version:string;
 facts_hash:string; store_data_revision:string; business_date:string;
 facts_snapshot:PredictionFacts; content:PredictionContent; generated_at:string;
}
export interface DeliveredPrediction extends SavedPrediction {output:PredictionOutput; stale:boolean; source:'ai_generated'}
export type PredictionStatus='ready'|'stale'|'not_generated'|'legacy_result'|'invalid_saved_result';
export interface PredictionReadResult {
 context:PredictionContext; insight:DeliveredPrediction|null; status:PredictionStatus;
 source:'database'|'provider'|'none';
}
export interface PredictionRequestContext {requestId:string; promptVersion:string; signal:AbortSignal}
export interface ProviderPrediction {output:unknown; responseId:string|null; responseModel:string|null}
export interface PredictionProvider {
 readonly name:string; readonly model:string;
 generateInventoryInsights(facts:PredictionFacts,language:Language,context:PredictionRequestContext):Promise<ProviderPrediction>;
}
