import {AppError} from '../errors';
import {predictionContentSchema,predictionOutputSchema,type PredictionContext,type PredictionFacts,type PredictionOutput,type SavedPrediction,type DeliveredPrediction,type PredictionProduct} from './prediction-contracts';

export function discountedUnitPrice(product:PredictionProduct,discountPercent:number):bigint {
 return (BigInt(product.selling_price_paisa)*BigInt(100-discountPercent)+50n)/100n;
}
/** Checks references, numeric coherence and margin safety. It cannot certify prose or forecast accuracy. */
export function validatePrediction(raw:unknown,facts:PredictionFacts):PredictionOutput{
 const serialized=JSON.stringify(raw);
 if(!serialized||serialized.length>40_000)throw new AppError('AI_INVALID_OUTPUT');
 const parsed=predictionOutputSchema.safeParse(raw);
 if(!parsed.success)throw new AppError('AI_INVALID_OUTPUT');
 const output=parsed.data,products=new Map(facts.products.map(product=>[product.id,product]));
 const seen=new Set<string>();
 const texts=[output.summary,...output.assumptions,...output.limitations,...output.predictions.map(p=>p.explanation),...output.suggestions.flatMap(s=>[s.title,s.explanation,s.expected_impact])];
 // Render plain text only. Do not execute, linkify or interpret provider instructions.
 if(texts.some(t=>/[<>]|https?:\/\/|\{\{/i.test(t)||[...t].some(c=>c.charCodeAt(0)<32&&!['\n','\r','\t'].includes(c))))throw new AppError('AI_INVALID_OUTPUT');
 for(const prediction of output.predictions){
  const product=products.get(prediction.product_id);
  if(!product||seen.has(product.id)||prediction.low_units_7d>prediction.expected_units_7d||prediction.expected_units_7d>prediction.high_units_7d)throw new AppError('AI_INVALID_OUTPUT');
  if(prediction.confidence==='high'&&(product.observed_days<28||product.active_sale_days_30d<8))throw new AppError('AI_INVALID_OUTPUT');
  if(new Set(prediction.evidence).size!==prediction.evidence.length)throw new AppError('AI_INVALID_OUTPUT');
  seen.add(product.id);
 }
 const suggestions=new Set<string>();
 for(const suggestion of output.suggestions){
  const product=suggestion.product_id?products.get(suggestion.product_id):undefined;
  if(suggestion.product_id&&!product)throw new AppError('AI_INVALID_OUTPUT');
  if(!product&&suggestion.action!=='collect_data')throw new AppError('AI_INVALID_OUTPUT');
  const key=`${suggestion.product_id}:${suggestion.action}`;
  if(suggestions.has(key)||new Set(suggestion.evidence).size!==suggestion.evidence.length)throw new AppError('AI_INVALID_OUTPUT');
  suggestions.add(key);
  if(suggestion.action==='restock'){
   if(!product||!seen.has(product.id)||!suggestion.reorder_quantity||suggestion.discount_percent!==null)throw new AppError('AI_INVALID_OUTPUT');
  }else if(suggestion.reorder_quantity!==null)throw new AppError('AI_INVALID_OUTPUT');
  if(suggestion.action==='discount_test'){
   if(!product||product.quantity<=0||suggestion.discount_percent===null||BigInt(product.reference_cost_paisa)<=0n)throw new AppError('AI_INVALID_OUTPUT');
   const after=discountedUnitPrice(product,suggestion.discount_percent);
   if((after-BigInt(product.reference_cost_paisa))*100n<after*10n)throw new AppError('AI_INVALID_OUTPUT');
  }else if(suggestion.discount_percent!==null)throw new AppError('AI_INVALID_OUTPUT');
 }
 return output;
}
export function deliverPrediction(stored:SavedPrediction,current:PredictionContext):DeliveredPrediction{
 if(stored.facts_snapshot?.schema_version!=='prediction-facts-v3')throw new AppError('AI_INVALID_OUTPUT');
 const content=predictionContentSchema.safeParse(stored.content);
 if(!content.success)throw new AppError('AI_INVALID_OUTPUT');
 const output=validatePrediction(content.data.output,stored.facts_snapshot);
 return {...stored,content:content.data,output,source:'ai_generated',stale:stored.facts_hash!==current.facts_hash||String(stored.store_data_revision)!==current.facts.data_revision||stored.business_date!==current.facts.business_date};
}
