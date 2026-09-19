import 'server-only';
import {rpc,requireOwner} from '../server/data';
import {configuredProvider} from './registry';
import {buildPolicy,validateOutput,deliverInsight} from './grounding';
import type {InsightContext,StoredInsight,Language} from './contracts';
import type {Json} from '../database.types';
export const insightContext=()=>rpc<InsightContext>('get_insight_context');
export async function getInsight(language:Language){const [context,latest]=await Promise.all([insightContext(),rpc<StoredInsight|null>('latest_insight',{p_language:language})]);return {context,insight:latest?deliverInsight(latest,context):null};}
export async function generateInventoryInsight(language:Language,regenerate:boolean){
 await requireOwner();const {config,provider}=configuredProvider();
 const started=Date.now(),requestId=crypto.randomUUID();
 const begin=await rpc<{cached:boolean;insight?:StoredInsight;lease_id?:string;context:InsightContext}>('begin_insight',{p_language:language,p_provider:provider.name,p_model:provider.model,p_prompt_version:config.promptVersion,p_force:regenerate,p_limit:config.quota});
 if(begin.cached&&begin.insight)return {context:begin.context,insight:deliverInsight(begin.insight,begin.context),cached:true};
 const lease=begin.lease_id!;
 try{
  const policy=buildPolicy(begin.context.facts,language);
  const output=await provider.generateInventoryInsights(begin.context.facts,language,{requestId,promptVersion:config.promptVersion,signal:AbortSignal.timeout(config.timeoutMs),policy});
  const selection=validateOutput(output,policy);
  const saved=await rpc<StoredInsight>('finish_insight',{p_lease_id:lease,p_content:selection as Json});
  const current=await insightContext();
  console.info(JSON.stringify({event:'insight_generated',request_id:requestId,provider:provider.name,model:provider.model,duration_ms:Date.now()-started}));
  return {context:current,insight:deliverInsight(saved,current),cached:false};
 }catch(error){await rpc('release_insight_lease',{p_lease_id:lease}).catch(()=>undefined);throw error;}
}
