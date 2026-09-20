import {AppError} from '../errors';

export type AIProviderName='gemini'|'openrouter';
export const DEFAULT_OPENROUTER_MODEL='nvidia/nemotron-3-ultra-550b-a55b:free';

export interface AIConfig {
 provider:AIProviderName;
 model:string;
 key:string;
 timeoutMs:number;
 maxTokens:number;
 quota:number;
 promptVersion:string;
 appUrl?:string;
}

const geminiModel=/^[a-zA-Z0-9._-]{1,100}$/;
const openRouterModel=/^[a-zA-Z0-9._:/-]{1,160}$/;

export function readAIConfig(env:Record<string,string|undefined>):AIConfig{
 const provider=(env.AI_PROVIDER??'openrouter') as AIProviderName;
 let key:string|undefined,model:string|undefined;
 if(provider==='openrouter'){
  key=env.OPENROUTER_API_KEY;
  model=env.OPENROUTER_TEXT_MODEL??DEFAULT_OPENROUTER_MODEL;
  if(!key||!openRouterModel.test(model))throw new AppError('AI_NOT_CONFIGURED');
 }else if(provider==='gemini'){
  key=env.GEMINI_API_KEY;
  model=env.GEMINI_TEXT_MODEL;
  if(!key||!model||!geminiModel.test(model))throw new AppError('AI_NOT_CONFIGURED');
 }else throw new AppError('AI_PROVIDER_UNSUPPORTED');
 const timeoutMs=Number(env.AI_REQUEST_TIMEOUT_MS??30000),maxTokens=Number(env.AI_MAX_OUTPUT_TOKENS??1500),quota=Number(env.AI_MAX_REQUESTS_PER_HOUR??10);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000||!Number.isInteger(maxTokens)||maxTokens<256||maxTokens>3000||!Number.isInteger(quota)||quota<1||quota>10)throw new AppError('AI_NOT_CONFIGURED');
 return {provider,model,key,timeoutMs,maxTokens,quota,promptVersion:env.AI_PROMPT_VERSION??'inventory-insights-v1',appUrl:env.APP_URL};
}
