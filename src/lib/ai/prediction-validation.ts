import {AppError} from '../errors';
import {predictionContentSchema,predictionOutputSchema,type PredictionContext,type PredictionFacts,type PredictionOutput,type SavedPrediction,type DeliveredPrediction,type PredictionProduct} from './prediction-contracts';

export function discountedUnitPrice(product:PredictionProduct,discountPercent:number):bigint {
 return (BigInt(product.selling_price_paisa)*BigInt(100-discountPercent)+50n)/100n;
}
function invalid(reason:string):never { throw new AppError('AI_INVALID_OUTPUT',{reason}); }
function uniqueEvidence<T extends string>(values:T[]):T[]{return [...new Set(values)];}
/**
 * Checks references, numeric coherence and margin safety.
 * Harmless provider deviations are normalized; fabricated references and incoherent
 * forecast numbers are still rejected, and unsafe suggestions are never persisted.
 */
export function validatePrediction(raw:unknown,facts:PredictionFacts):PredictionOutput{
 const serialized=JSON.stringify(raw);
 if(!serialized||serialized.length>40_000)invalid('response_size');
 const parsed=predictionOutputSchema.safeParse(raw);
 if(!parsed.success)invalid('schema');
 const output=structuredClone(parsed.data),products=new Map(facts.products.map(product=>[product.id,product]));
 const seen=new Set<string>();
 const texts=[output.summary,...output.assumptions,...output.limitations,...output.predictions.map(p=>p.explanation),...output.suggestions.flatMap(s=>[s.title,s.explanation,s.expected_impact])];
 // Render plain text only. Do not execute, linkify or interpret provider instructions.
 if(texts.some(t=>/[<>]|https?:\/\/|\{\{/i.test(t)||[...t].some(c=>c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c))))invalid('unsafe_text');
 for(const prediction of output.predictions){
  const product=products.get(prediction.product_id);
  if(!product)invalid('unknown_prediction_product');
  if(seen.has(product.id))invalid('duplicate_prediction_product');
  if(prediction.low_units_7d>prediction.expected_units_7d||prediction.expected_units_7d>prediction.high_units_7d)invalid('incoherent_prediction_range');
  prediction.evidence=uniqueEvidence(prediction.evidence);
  // Confidence is descriptive, not a numeric safety property. Do not discard an otherwise
  // useful forecast because a free model overstates the label; conservatively downgrade it.
  if(prediction.confidence==='high'&&(product.observed_days<28||product.active_sale_days_30d<8)){
   prediction.confidence=product.observed_days<14||product.active_sale_days_30d<4?'low':'medium';
  }
  seen.add(product.id);
 }
 const suggestions=new Set<string>(),safeSuggestions:PredictionOutput['suggestions']=[];
 for(const suggestion of output.suggestions){
  const product=suggestion.product_id?products.get(suggestion.product_id):undefined;
  if(suggestion.product_id&&!product)invalid('unknown_suggestion_product');
  if(!product&&suggestion.action!=='collect_data')continue;
  const key=`${suggestion.product_id}:${suggestion.action}`;
  if(suggestions.has(key))continue;
  suggestions.add(key);
  suggestion.evidence=uniqueEvidence(suggestion.evidence);
  if(suggestion.action==='restock'){
   if(!product||!seen.has(product.id)||!suggestion.reorder_quantity||suggestion.discount_percent!==null)continue;
   const forecast=output.predictions.find(prediction=>prediction.product_id===product.id)!;
   // Do not recommend replenishment using historical sales when the model's
   // own next-week forecast leaves stock at or above the minimum reserve.
   if(product.quantity-forecast.expected_units_7d>=product.minimum_stock)continue;
  }else if(suggestion.reorder_quantity!==null){
   suggestion.reorder_quantity=null;
  }
  if(suggestion.action==='discount_test'){
   if(!product||product.quantity<=0||suggestion.discount_percent===null||BigInt(product.reference_cost_paisa)<=0n)continue;
   const after=discountedUnitPrice(product,suggestion.discount_percent);
   if((after-BigInt(product.reference_cost_paisa))*100n<after*10n)continue;
  }else if(suggestion.discount_percent!==null){
   suggestion.discount_percent=null;
  }
  safeSuggestions.push(suggestion);
 }
 if(!safeSuggestions.length)invalid('no_safe_suggestions');
 output.suggestions=safeSuggestions;
 return output;
}
export function deliverPrediction(stored:SavedPrediction,current:PredictionContext):DeliveredPrediction{
 if(stored.facts_snapshot?.schema_version!=='prediction-facts-v3')invalid('saved_facts_schema');
 const content=predictionContentSchema.safeParse(stored.content);
 if(!content.success)invalid('saved_content_schema');
 const output=validatePrediction(content.data.output,stored.facts_snapshot);
 return {...stored,content:{...content.data,output},output,source:'ai_generated',stale:stored.facts_hash!==current.facts_hash||String(stored.store_data_revision)!==current.facts.data_revision||stored.business_date!==current.facts.business_date};
}
