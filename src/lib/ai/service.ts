import 'server-only';
import {rpc,requireOwner} from '../server/data';
import {configuredProvider} from './registry';
import {buildPolicy,validateOutput,deliverInsight} from './grounding';
import type {InsightContext,StoredInsight,Language,DeliveredInsight} from './contracts';
import type {Json} from '../database.types';

export const insightContext=()=>rpc<InsightContext>('get_insight_context');
function safeDeliver(stored:StoredInsight|null|undefined,current:InsightContext):DeliveredInsight|null{
 if(!stored)return null;
 try{return deliverInsight(stored,current);}catch{return null;}
}
export async function getInsight(language:Language){
 const [context,latest]=await Promise.all([insightContext(),rpc<StoredInsight|null>('latest_insight',{p_language:language})]);
 return {context,insight:safeDeliver(latest,context)};
}
export async function generateInventoryInsight(language:Language,regenerate:boolean){
 await requireOwner();
 const {config,provider}=configuredProvider();
 const started=Date.now(),requestId=crypto.randomUUID();
 const args={p_language:language,p_provider:provider.name,p_model:provider.model,p_prompt_version:config.promptVersion,p_limit:config.quota};
 let begin=await rpc<{cached:boolean;insight?:StoredInsight;lease_id?:string;context:InsightContext}>('begin_insight',{...args,p_force:regenerate});
 if(begin.cached&&begin.insight){
  const delivered=safeDeliver(begin.insight,begin.context);
  if(delivered)return {context:begin.context,insight:delivered,cached:true};
  begin=await rpc('begin_insight',{...args,p_force:true});
 }
 const lease=begin.lease_id;
 if(!lease)throw new Error('AI suggestion lease was not created.');
 try{
  const policy=buildPolicy(begin.context.facts,language);
  if(!Object.values(policy.sections).some(Boolean))throw new Error('Not enough historical activity exists yet to create grounded suggestions.');
  const output=await provider.generateInventoryInsights(begin.context.facts,language,{requestId,promptVersion:config.promptVersion,signal:AbortSignal.timeout(config.timeoutMs),policy});
  const selection=validateOutput(output,policy);
  const saved=await rpc<StoredInsight>('finish_insight',{p_lease_id:lease,p_content:selection as Json});
  const current=await insightContext();
  console.info(JSON.stringify({event:'suggestion_generated',request_id:requestId,provider:provider.name,model:provider.model,duration_ms:Date.now()-started}));
  return {context:current,insight:deliverInsight(saved,current),cached:false};
 }catch(error){
  await rpc('release_insight_lease',{p_lease_id:lease}).catch(()=>undefined);
  throw error;
 }
}
