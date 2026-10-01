import {AppError} from '../errors';
import type {Language} from './contracts';
import type {AIConfig} from './config';
import {deliverPrediction,validatePrediction} from './prediction-validation';
import type {PredictionContext,PredictionOutput,PredictionProvider,PredictionReadResult,ProviderPrediction,SavedPrediction} from './prediction-contracts';

export interface PredictionDependencies {
 config:AIConfig; provider:PredictionProvider;
 begin:(language:Language)=>Promise<{lease_id:string;context:PredictionContext}>;
 finish:(lease:string,output:PredictionOutput,result:ProviderPrediction)=>Promise<SavedPrediction>;
 release:(lease:string)=>Promise<unknown>;
 current:()=>Promise<PredictionContext>;
}
/** Deliberately has no cached-result path. Each accepted Generate command invokes the provider. */
export async function runPrediction(language:Language,deps:PredictionDependencies):Promise<PredictionReadResult & {cached:false;provider_called:true;request_id:string}>{
 const begun=await deps.begin(language),requestId=crypto.randomUUID();
 if(!begun.lease_id)throw new AppError('AI_UNAVAILABLE');
 try{
  if(begun.context.facts.schema_version!=='prediction-facts-v3')throw new AppError('AI_INPUT_UNAVAILABLE');
  const result=await deps.provider.generateInventoryInsights(begun.context.facts,language,{requestId,promptVersion:deps.config.promptVersion,signal:AbortSignal.timeout(deps.config.timeoutMs)});
  const output=validatePrediction(result.output,begun.context.facts);
  const saved=await deps.finish(begun.lease_id,output,result);
  // A refresh-read failure must not turn a successfully persisted result into a failed generation.
  const context=await deps.current().catch(()=>begun.context);
  const insight=deliverPrediction(saved,context);
  return {context,insight,status:insight.stale?'stale':'ready',source:'provider',cached:false,provider_called:true,request_id:requestId};
 }catch(error){
  await deps.release(begun.lease_id).catch(()=>undefined);
  throw error;
 }
}
export async function loadPrediction(
 current:()=>Promise<PredictionContext>,latest:()=>Promise<{insight:SavedPrediction|null;has_legacy_result:boolean}>
):Promise<PredictionReadResult>{
 const [context,saved]=await Promise.all([current(),latest()]);
 if(!saved.insight)return {context,insight:null,status:saved.has_legacy_result?'legacy_result':'not_generated',source:'none'};
 try{
  const insight=deliverPrediction(saved.insight,context);
  return {context,insight,status:insight.stale?'stale':'ready',source:'database'};
 }catch{
  return {context,insight:null,status:'invalid_saved_result',source:'none'};
 }
}
