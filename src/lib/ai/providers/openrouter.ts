import {AppError} from '../../errors';
import {buildPredictionPrompt} from '../prediction-prompt';
import {readProviderJson,providerMetadata} from '../provider-response';
import type {Language} from '../contracts';
import type {PredictionProvider,PredictionFacts,PredictionRequestContext,ProviderPrediction} from '../prediction-contracts';

// This is an output schema, NOT a database write tool. Returned arguments are independently validated.
const TOOL_NAME='submit_inventory_prediction';
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
     body:JSON.stringify({model:this.model,messages:[{role:'system',content:prompt.system},{role:'user',content:prompt.user}],
      tools:[{type:'function',function:{name:TOOL_NAME,description:'Return your own sales predictions, uncertainty ranges, business suggestions and explanations from the supplied historical observations.',parameters:prompt.schema}}],
      tool_choice:{type:'function',function:{name:TOOL_NAME}},parallel_tool_calls:false,temperature:0.2,max_tokens:this.maxTokens})
    });
    if(!response.ok){await response.body?.cancel();if(attempt===0&&(response.status===429||response.status>=500)&&!context.signal.aborted){await new Promise(resolve=>setTimeout(resolve,250));continue;}throw new AppError('AI_UNAVAILABLE');}
    const parsed=await readProviderJson(response) as {id?:unknown;model?:unknown;choices?:{finish_reason?:string;message?:{tool_calls?:{type?:string;function?:{name?:string;arguments?:string}}[]}}[];error?:unknown};
    if(!parsed||typeof parsed!=='object'||parsed.error)throw new AppError('AI_UNAVAILABLE');
    const choice=parsed.choices?.[0];
    if(!choice||choice.finish_reason==='length')throw new AppError('AI_INVALID_OUTPUT');
    const calls=choice.message?.tool_calls??[];
    if(calls.length!==1||calls[0].type!=='function'||calls[0].function?.name!==TOOL_NAME)throw new AppError('AI_INVALID_OUTPUT');
    const args=calls[0].function?.arguments;
    if(typeof args!=='string'||args.length>40_000)throw new AppError('AI_INVALID_OUTPUT');
    let output:unknown;try{output=JSON.parse(args);}catch{throw new AppError('AI_INVALID_OUTPUT');}
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
