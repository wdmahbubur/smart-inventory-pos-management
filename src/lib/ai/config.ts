import {AppError} from '../errors';
export interface AIConfig {provider:'gemini';model:string;key:string;timeoutMs:number;maxTokens:number;quota:number;promptVersion:string}
export function readAIConfig(env:Record<string,string|undefined>):AIConfig{
 const provider=env.AI_PROVIDER??'gemini';
 if(provider!=='gemini')throw new AppError('AI_PROVIDER_UNSUPPORTED');
 if(!env.GEMINI_API_KEY||!env.GEMINI_TEXT_MODEL)throw new AppError('AI_NOT_CONFIGURED');
 if(!/^[a-zA-Z0-9._-]{1,100}$/.test(env.GEMINI_TEXT_MODEL))throw new AppError('AI_NOT_CONFIGURED');
 const timeoutMs=Number(env.AI_REQUEST_TIMEOUT_MS??30000),maxTokens=Number(env.AI_MAX_OUTPUT_TOKENS??1500),quota=Number(env.AI_MAX_REQUESTS_PER_HOUR??10);
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000||!Number.isInteger(maxTokens)||maxTokens<256||maxTokens>3000||!Number.isInteger(quota)||quota<1||quota>10)throw new AppError('AI_NOT_CONFIGURED');
 return {provider,model:env.GEMINI_TEXT_MODEL,key:env.GEMINI_API_KEY,timeoutMs,maxTokens,quota,promptVersion:env.AI_PROMPT_VERSION??'inventory-insights-v1'};
}
