import 'server-only';
import {rpc,requireOwner} from '../server/data';
import {configuredProvider} from './registry';
import {loadPrediction,runPrediction} from './prediction-generation';
import type {PredictionContext,SavedPrediction} from './prediction-contracts';
import type {Language} from './contracts';
import type {Json} from '../database.types';

export const insightContext=()=>rpc<PredictionContext>('get_prediction_context');
export function getInsight(language:Language){
 return loadPrediction(insightContext,()=>rpc<{insight:SavedPrediction|null;has_legacy_result:boolean}>('latest_prediction',{p_language:language}));
}
export async function generateInventoryInsight(language:Language){
 await requireOwner();
 const {config,provider}=configuredProvider(),started=Date.now();
 const result=await runPrediction(language,{
  config,provider,
  begin:lang=>rpc('begin_prediction',{p_language:lang,p_provider:provider.name,p_model:provider.model,p_prompt_version:config.promptVersion,p_limit:config.quota}),
  finish:(lease,output,response)=>rpc('finish_prediction',{p_lease_id:lease,p_output:output as Json,p_response_id:response.responseId,p_response_model:response.responseModel}),
  release:lease=>rpc('release_insight_lease',{p_lease_id:lease}),
  current:insightContext
 });
 console.info(JSON.stringify({event:'prediction_generated',request_id:result.request_id,provider:provider.name,model:provider.model,response_id:result.insight?.content.provider_response_id,duration_ms:Date.now()-started}));
 return result;
}
