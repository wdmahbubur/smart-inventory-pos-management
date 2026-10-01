import {AppError} from '../../errors';
import {buildPredictionPrompt} from '../prediction-prompt';
import {readProviderJson,providerMetadata} from '../provider-response';
import type {Language} from '../contracts';
import type {PredictionProvider,PredictionFacts,PredictionRequestContext,ProviderPrediction} from '../prediction-contracts';

const TOOL_NAME='submit_inventory_prediction';
function invalid(reason:string):never{throw new AppError('AI_INVALID_OUTPUT',{reason});}
function parsePayload(value:unknown):unknown{
 if(value&&typeof value==='object')return value;
 if(typeof value!=='string')invalid('provider_content_missing');
 let text=value.trim();
 if(text.startsWith('```')){
  text=text.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
 }
 if(!text||text.length>40_000)invalid('provider_content_size');
 try{return JSON.parse(text);}catch{invalid('provider_json');}
}

export class OpenRouterProvider implements PredictionProvider{
 readonly name='openrouter';
 constructor(readonly model:string,private readonly apiKey:string,private readonly maxTokens=6000,private readonly transport:typeof fetch=fetch,private readonly appUrl?:string){}
 async generateInventoryInsights(facts:PredictionFacts,language:Language,context:PredictionRequestContext):Promise<ProviderPrediction>{
  const prompt=buildPredictionPrompt(facts,language,context.promptVersion);
  for(let attempt=0;attempt<2;attempt++){
   try{
    const headers:Record<string,string>={'Authorization':`Bearer ${this.apiKey}`,'Content-Type':'application/json','X-Title':'Smart Inventory'};
    if(this.appUrl){try{const url=new URL(this.appUrl);if(['http:','https:'].includes(url.protocol))headers['HTTP-Referer']=url.origin;}catch{/* Optional attribution is not required. */}}
    const response=await this.transport('https://openrouter.ai/api/v1/chat/completions',{
     method:'POST',cache:'no-store',headers,signal:context.signal,
     body:JSON.stringify({
      model:this.model,
      messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}],
      provider:{require_parameters:true},
      response_format:{type:'json_schema',json_schema:{name:'inventory_prediction',strict:true,schema:prompt.schema}},
      temperature:0.2,
      max_tokens:this.maxTokens
     })
    });
    if(!response.ok){
     await response.body?.cancel();
     if(attempt===0&&(response.status===429||response.status>=500)&&!context.signal.aborted){await new Promise(resolve=>setTimeout(resolve,250));continue;}
     throw new AppError('AI_UNAVAILABLE');
    }
    const parsed=await readProviderJson(response) as {
     id?:unknown;model?:unknown;error?:unknown;
     choices?:{finish_reason?:string;message?:{content?:unknown;tool_calls?:{type?:string;function?:{name?:string;arguments?:unknown}}[]}}[]
    };
    if(!parsed||typeof parsed!=='object'||parsed.error)throw new AppError('AI_UNAVAILABLE');
    const choice=parsed.choices?.[0];
    if(!choice)invalid('provider_choice_missing');
    if(choice.finish_reason==='length')invalid('provider_truncated');

    let output:unknown;
    const calls=choice.message?.tool_calls??[];
    // Compatibility fallback for providers that still return a function call even when
    // structured response_format is requested. The output is validated identically.
    if(calls.length===1&&calls[0].function?.name===TOOL_NAME){
     output=parsePayload(calls[0].function?.arguments);
    }else{
     output=parsePayload(choice.message?.content);
    }
    return {output,responseId:providerMetadata(parsed.id,200),responseModel:providerMetadata(parsed.model,160)};
   }catch(error){
    if(context.signal.aborted)throw new AppError('AI_TIMEOUT');
    if(error instanceof AppError)throw error;
    if(attempt===0)continue;
    throw new AppError('AI_UNAVAILABLE');
   }
  }
  throw new AppError('AI_UNAVAILABLE');
 }
}
