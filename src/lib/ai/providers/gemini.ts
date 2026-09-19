import {AppError} from '../../errors';
import {buildPrompt} from '../prompt';
import type {InventoryInsightProvider,InventoryFacts,Language,RequestContext} from '../contracts';
export class GeminiProvider implements InventoryInsightProvider{
 readonly name='gemini';
 constructor(readonly model:string,private readonly apiKey:string,private readonly maxTokens=1500,private readonly transport:typeof fetch=fetch){}
 async generateInventoryInsights(facts:InventoryFacts,language:Language,context:RequestContext):Promise<unknown>{
  const prompt=buildPrompt(facts,language,context.policy,context.promptVersion);
  for(let attempt=0;attempt<2;attempt++){
   try{
    const response=await this.transport(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':this.apiKey},signal:context.signal,body:JSON.stringify({systemInstruction:{parts:[{text:prompt.system}]},contents:[{role:'user',parts:[{text:prompt.user}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:prompt.schema,maxOutputTokens:this.maxTokens,...(this.model.startsWith('gemini-2.5-flash')?{thinkingConfig:{thinkingBudget:0}}:{})}})});
    if(!response.ok){if(attempt===0&&(response.status===429||response.status>=500)&&!context.signal.aborted){await new Promise(resolve=>setTimeout(resolve,250));continue;}throw new AppError('AI_UNAVAILABLE');}
    const text=await response.text();if(text.length>32000)throw new AppError('AI_INVALID_OUTPUT');
    const parsed=JSON.parse(text) as {candidates?:{finishReason?:string;content?:{parts?:{text?:string;thought?:boolean}[]}}[]};
    const candidate=parsed.candidates?.[0];if(candidate?.finishReason!=='STOP')throw new AppError('AI_INVALID_OUTPUT');
    const content=candidate.content?.parts?.filter(part=>!part.thought).map(part=>part.text??'').join('');if(!content)throw new AppError('AI_INVALID_OUTPUT');
    try{return JSON.parse(content);}catch{throw new AppError('AI_INVALID_OUTPUT');}
   }catch(error){if(context.signal.aborted)throw new AppError('AI_TIMEOUT');if(error instanceof AppError)throw error;if(attempt===0)continue;throw new AppError('AI_UNAVAILABLE');}
  }
  throw new AppError('AI_UNAVAILABLE');
 }
}
