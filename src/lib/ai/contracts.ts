import {z} from 'zod';
import type {InventorySummary,ActivitySummary,ValueCategory} from '../domain';

export type Language='bn'|'en';
export type ForecastConfidence='low'|'medium'|'high';

export interface ProductForecastSignal {
 id:string;
 name:string;
 sku:string;
 unit:string;
 quantity:number;
 minimum_stock:number;
 selling_price_paisa:string;
 reference_cost_paisa:string;
 units_7d:number;
 units_prev_7d:number;
 units_30d:number;
 active_sale_days_30d:number;
 revenue_30d_paisa:string;
 profit_30d_paisa:string;
 trend_pct:number;
 forecast_7d_units:number;
 forecast_daily_units:number;
 stock_cover_days:number|null;
 suggested_restock_qty:number;
 days_without_sale:number|null;
 last_sale_at:string|null;
 margin_pct:number;
 discount_opportunity_pct:number;
 discounted_unit_profit_paisa:string;
 confidence:ForecastConfidence;
}

export interface ForecastFacts {
 lookback_days:56;
 horizon_days:7;
 weekday:string;
 weekday_factor:number;
 total_units_7d:number;
 total_units_prev_7d:number;
 total_units_30d:number;
 predicted_units_7d:number;
 top_sellers:ProductForecastSignal[];
 restock_candidates:ProductForecastSignal[];
 discount_candidates:ProductForecastSignal[];
 stagnant_products:ProductForecastSignal[];
 profit_leaders:ProductForecastSignal[];
}

export interface InventoryFacts {
 schema_version:'inventory-facts-v2';
 snapshot_at:string;
 business_date:string;
 timezone:'Asia/Dhaka';
 currency:'BDT';
 data_revision:string;
 inventory:InventorySummary;
 sales:ActivitySummary;
 purchases:ActivitySummary;
 forecast:ForecastFacts;
 attention:{id:string;name:string;quantity:number;minimum_stock:number;unit:string;shortage:number}[];
 attention_truncated:boolean;
 categories:ValueCategory[];
 highest_category:ValueCategory|null;
 definitions:Record<string,string>;
}

export interface InsightContext {facts:InventoryFacts;facts_hash:string}

export const selectionSchema=z.object({
 summary_key:z.enum(['growth','inventory','margin']),
 section_keys:z.array(z.enum(['demand','restock','discount','stagnant','profit']))
  .min(1).max(4)
  .refine(values=>new Set(values).size===values.length)
}).strict();
export type InsightSelection=z.infer<typeof selectionSchema>;

export const outputSchema=z.object({
 summary:z.string().min(1).max(1400),
 sections:z.array(z.object({
  heading:z.string().min(1).max(140),
  explanation:z.string().min(1).max(1800),
  fact_ids:z.array(z.string().regex(/^[a-z0-9_]+$/)).min(1).max(14)
 }).strict()).min(1).max(4)
}).strict();
export type InsightOutput=z.infer<typeof outputSchema>;

export interface InsightPolicy {
 summaries:Record<InsightSelection['summary_key'],string>;
 sections:Partial<Record<InsightSelection['section_keys'][number],InsightOutput['sections'][number]>>;
 factMap:Record<string,{label:string;value:string;kind:'text'|'number'|'money'}>;
}
export interface RequestContext {requestId:string;promptVersion:string;signal:AbortSignal;policy:InsightPolicy}
export interface InventoryInsightProvider {readonly name:string;readonly model:string;generateInventoryInsights(facts:InventoryFacts,language:Language,context:RequestContext):Promise<unknown>}
export interface StoredInsight {id:string;language:Language;provider:string;model:string;prompt_version:string;facts_hash:string;store_data_revision:string;business_date:string;facts_snapshot:InventoryFacts;content:InsightSelection;generated_at:string}
export interface DeliveredInsight extends StoredInsight {output:InsightOutput;stale:boolean}
