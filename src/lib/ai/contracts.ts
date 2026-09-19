import {z} from 'zod';
import type {InventorySummary,ActivitySummary,ValueCategory} from '../domain';
export type Language='bn'|'en';
export interface InventoryFacts {
 schema_version:'inventory-facts-v1';snapshot_at:string;business_date:string;timezone:'Asia/Dhaka';currency:'BDT';data_revision:string;
 inventory:InventorySummary;sales:ActivitySummary;purchases:ActivitySummary;
 attention:{id:string;name:string;quantity:number;minimum_stock:number;unit:string;shortage:number}[];
 attention_truncated:boolean;categories:ValueCategory[];highest_category:ValueCategory|null;definitions:Record<string,string>;
}
export interface InsightContext {facts:InventoryFacts;facts_hash:string}
export const selectionSchema=z.object({summary_key:z.enum(['overview','attention','activity']),section_keys:z.array(z.enum(['stock','category','activity'])).min(1).max(3).refine(values=>new Set(values).size===values.length)}).strict();
export type InsightSelection=z.infer<typeof selectionSchema>;
export const outputSchema=z.object({summary:z.string().min(1).max(1200),sections:z.array(z.object({heading:z.string().min(1).max(120),explanation:z.string().min(1).max(1500),fact_ids:z.array(z.string().regex(/^[a-z_]+$/)).min(1).max(12)}).strict()).min(1).max(3)}).strict();
export type InsightOutput=z.infer<typeof outputSchema>;
export interface InsightPolicy {summaries:Record<InsightSelection['summary_key'],string>;sections:Partial<Record<InsightSelection['section_keys'][number],InsightOutput['sections'][number]>>;factMap:Record<string,{label:string;value:string;kind:'text'|'number'|'money'}>}
export interface RequestContext {requestId:string;promptVersion:string;signal:AbortSignal;policy:InsightPolicy}
export interface InventoryInsightProvider {readonly name:string;readonly model:string;generateInventoryInsights(facts:InventoryFacts,language:Language,context:RequestContext):Promise<unknown>}
export interface StoredInsight {id:string;language:Language;provider:string;model:string;prompt_version:string;facts_hash:string;store_data_revision:string;business_date:string;facts_snapshot:InventoryFacts;content:InsightSelection;generated_at:string}
export interface DeliveredInsight extends StoredInsight {output:InsightOutput;stale:boolean}
