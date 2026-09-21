import {AppError} from '../../errors';
import {buildPrompt} from '../prompt';
import type {InventoryInsightProvider,InventoryFacts,Language,RequestContext} from '../contracts';

// Nemotron's OpenRouter route supports tool calling; forced tool arguments carry the approved schema selection.
const TOOL_NAME='select_inventory_insight';

export class OpenRouterProvider implements InventoryInsightProvider{
 readonly name='openrouter';
 constructor(
  readonly model:string,
  private readonly apiKey:string,
  private readonly maxTokens=1500,
  private readonly transport:typeof fetch=fetch,
  private readonly appUrl?:string
 ){}

 async generateInventoryInsights(facts:InventoryFacts,language:Language,context:RequestContext):Promise<unknown>{
  const prompt=buildPrompt(facts,language,context.policy,context.promptVersion);
  for(let attempt=0;attempt<2;attempt++){
   try{
    const headers:Record<string,string>={
     'Authorization':`Bearer ${this.apiKey}`,
     'Content-Type':'application/json',
     'X-Title':'Smart Inventory'
    };
    if(this.appUrl){
     try{const origin=new URL(this.appUrl);if(['http:','https:'].includes(origin.protocol))headers['HTTP-Referer']=origin.origin;}catch{/* Optional attribution header is omitted when APP_URL is invalid. */}
    }
    const response=await this.transport('https://openrouter.ai/api/v1/chat/completions',{
     method:'POST',
     headers,
     signal:context.signal,
     body:JSON.stringify({
      model:this.model,
      messages:[
       {role:'system',content:prompt.system},
       {role:'user',content:prompt.user}
      ],
      tools:[{
       type:'function',
       function:{
        name:TOOL_NAME,
        description:'Select only approved summary and suggestion priority keys supplied by the application.',
        parameters:prompt.schema
       }
      }],
      tool_choice:{type:'function',function:{name:TOOL_NAME}},
      temperature:0,
      max_tokens:this.maxTokens
     })
    });
    if(!response.ok){
     if(attempt===0&&(response.status===429||response.status>=500)&&!context.signal.aborted){
      await new Promise(resolve=>setTimeout(resolve,250));
      continue;
     }
     throw new AppError('AI_UNAVAILABLE');
    }
    const text=await response.text();
    if(text.length>32000)throw new AppError('AI_INVALID_OUTPUT');
    let parsed:{choices?:{finish_reason?:string;message?:{tool_calls?:{type?:string;function?:{name?:string;arguments?:string}}[]}}[];error?:unknown};
    try{parsed=JSON.parse(text);}catch{throw new AppError('AI_INVALID_OUTPUT');}
    if(parsed.error)throw new AppError('AI_UNAVAILABLE');
    const choice=parsed.choices?.[0];
    if(!choice||choice.finish_reason==='length')throw new AppError('AI_INVALID_OUTPUT');
    const calls=choice.message?.tool_calls??[];
    if(calls.length!==1||calls[0].type!=='function'||calls[0].function?.name!==TOOL_NAME)throw new AppError('AI_INVALID_OUTPUT');
    const args=calls[0].function?.arguments;
    if(typeof args!=='string'||args.length>16000)throw new AppError('AI_INVALID_OUTPUT');
    try{return JSON.parse(args);}catch{throw new AppError('AI_INVALID_OUTPUT');}
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
