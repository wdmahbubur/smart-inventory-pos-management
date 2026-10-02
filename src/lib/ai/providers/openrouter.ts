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

type OpenRouterWire={
 id?:unknown;
 model?:unknown;
 error?:unknown;
 choices?:{finish_reason?:string;message?:{content?:unknown;tool_calls?:{type?:string;function?:{name?:string;arguments?:unknown}}[]}}[];
};
type Mode='structured'|'plain_json';

export class OpenRouterProvider implements PredictionProvider{
 readonly name='openrouter';
 constructor(readonly model:string,private readonly apiKey:string,private readonly maxTokens=9000,private readonly transport:typeof fetch=fetch,private readonly appUrl?:string){}
 async generateInventoryInsights(facts:PredictionFacts,language:Language,context:PredictionRequestContext):Promise<ProviderPrediction>{
  const prompt=buildPredictionPrompt(facts,language,context.promptVersion);
  const headers:Record<string,string>={'Authorization':`Bearer ${this.apiKey}`,'Content-Type':'application/json','X-Title':'Smart Inventory'};
  if(this.appUrl){try{const url=new URL(this.appUrl);if(['http:','https:'].includes(url.protocol))headers['HTTP-Referer']=url.origin;}catch{/* Optional attribution is not required. */}}

  // The current free Apodex route has repeatedly rejected response_format with HTTP 400 in
  // production even though the model advertises structured-output support. Match the user's
  // working Postman shape for this model and rely on the same Zod + database validators after.
  const modes:Mode[]=this.model.startsWith('apodex/apodex-1.1-mini')?['plain_json']:['structured','plain_json'];

  for(const mode of modes){
   for(let attempt=0;attempt<2;attempt++){
    const compact=attempt===1;
    const tokenBudget=compact?Math.min(Math.max(this.maxTokens+3000,12_000),16_000):this.maxTokens;
    const compactInstruction=compact
     ?'\nYour previous response was too long or incomplete. Return a compact valid JSON object: at most 6 predictions and 4 suggestions; one short sentence per explanation; one assumption and one limitation. Do not omit required fields.'
     :'';
    const base={model:this.model,temperature:0.2,max_tokens:tokenBudget};
    const body=mode==='structured'
     ?{...base,messages:[{role:'system',content:prompt.system+compactInstruction},{role:'user',content:prompt.user}],response_format:{type:'json_schema',json_schema:{name:'inventory_prediction',strict:true,schema:prompt.schema}}}
     :{...base,messages:[
       {role:'system',content:`${prompt.system}\nReturn exactly one JSON object and no markdown. The JSON must match the schema supplied by the user.${compactInstruction}`},
       {role:'user',content:`${prompt.user}\n\nRequired JSON schema:\n${JSON.stringify(prompt.schema)}`}
      ]};
    try{
     const response=await this.transport('https://openrouter.ai/api/v1/chat/completions',{
      method:'POST',cache:'no-store',headers,signal:context.signal,body:JSON.stringify(body)
     });
     if(!response.ok){
      const status=response.status;
      await response.body?.cancel();
      console.warn(JSON.stringify({event:'openrouter_request_rejected',request_id:context.requestId,model:this.model,mode,status,attempt,token_budget:tokenBudget}));
      if(mode==='structured'&&[400,404,415,422].includes(status))break;
      if(attempt===0&&(status===429||status>=500)&&!context.signal.aborted){await new Promise(resolve=>setTimeout(resolve,250));continue;}
      throw new AppError('AI_UNAVAILABLE');
     }

     const parsed=await readProviderJson(response) as OpenRouterWire;
     if(!parsed||typeof parsed!=='object')invalid('provider_response_shape');
     if(parsed.error){
      console.warn(JSON.stringify({event:'openrouter_error_payload',request_id:context.requestId,model:this.model,mode,attempt}));
      if(mode==='structured')break;
      throw new AppError('AI_UNAVAILABLE');
     }
     const choice=parsed.choices?.[0];
     if(!choice)invalid('provider_choice_missing');
     if(choice.finish_reason==='length'){
      console.warn(JSON.stringify({event:'openrouter_response_truncated',request_id:context.requestId,model:this.model,mode,attempt,token_budget:tokenBudget}));
      if(attempt===0)continue;
      invalid('provider_truncated');
     }

     let output:unknown;
     const calls=choice.message?.tool_calls??[];
     if(calls.length===1&&calls[0].function?.name===TOOL_NAME){
      output=parsePayload(calls[0].function?.arguments);
     }else{
      output=parsePayload(choice.message?.content);
     }
     return {output,responseId:providerMetadata(parsed.id,200),responseModel:providerMetadata(parsed.model,160)};
    }catch(error){
     if(context.signal.aborted)throw new AppError('AI_TIMEOUT');
     if(error instanceof AppError){
      if(mode==='structured'&&error.code==='AI_INVALID_OUTPUT'){
       console.warn(JSON.stringify({event:'openrouter_structured_output_invalid',request_id:context.requestId,model:this.model,reason:error.details?.reason??'unknown'}));
       break;
      }
      if(mode==='plain_json'&&attempt===0&&error.code==='AI_INVALID_OUTPUT'&&['provider_json','provider_content_missing'].includes(String(error.details?.reason??''))){
       continue;
      }
      throw error;
     }
     if(attempt===0)continue;
     if(mode==='structured')break;
     throw new AppError('AI_UNAVAILABLE');
    }
   }
  }
  throw new AppError('AI_UNAVAILABLE');
 }
}
