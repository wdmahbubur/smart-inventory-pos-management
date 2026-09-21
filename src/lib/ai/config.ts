import {AppError} from '../errors';

export type AIProviderName='gemini'|'openrouter';
// Reviewed OpenRouter free-route model; the API key remains a server-only runtime secret.
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

function clean(value:string|undefined){
 const trimmed=value?.trim();
 if(!trimmed)return undefined;
 const quoted=(trimmed.startsWith('"')&&trimmed.endsWith('"'))||(trimmed.startsWith("'")&&trimmed.endsWith("'"));
 return quoted?trimmed.slice(1,-1).trim():trimmed;
}

export function readAIConfig(env:Record<string,string|undefined>):AIConfig{
 const requested=clean(env.AI_PROVIDER)?.toLowerCase();
 if(requested&&requested!=='openrouter'&&requested!=='gemini')throw new AppError('AI_PROVIDER_UNSUPPORTED');

 const openRouterKey=clean(env.OPENROUTER_API_KEY);
 const geminiKey=clean(env.GEMINI_API_KEY);

 // Prefer the configured OpenRouter key over a stale Gemini selector left from an older deployment,
 // unless Gemini is explicitly selected and actually has its own key.
 const provider:AIProviderName=requested==='gemini'&&geminiKey?'gemini':openRouterKey?'openrouter':(requested as AIProviderName|undefined)??'openrouter';

 let key:string|undefined,model:string|undefined;
 if(provider==='openrouter'){
  key=openRouterKey;
  model=clean(env.OPENROUTER_TEXT_MODEL)??DEFAULT_OPENROUTER_MODEL;
  if(!key)throw new AppError('OPENROUTER_NOT_CONFIGURED');
  if(!openRouterModel.test(model))throw new AppError('AI_NOT_CONFIGURED');
 }else{
  key=geminiKey;
  model=clean(env.GEMINI_TEXT_MODEL);
  if(!key||!model||!geminiModel.test(model))throw new AppError('AI_NOT_CONFIGURED');
 }

 const timeoutMs=Number(clean(env.AI_REQUEST_TIMEOUT_MS)??30000);
 const maxTokens=Number(clean(env.AI_MAX_OUTPUT_TOKENS)??1500);
 const quota=Number(clean(env.AI_MAX_REQUESTS_PER_HOUR)??10);
 const configuredPromptVersion=clean(env.AI_PROMPT_VERSION);
 const promptVersion=!configuredPromptVersion||configuredPromptVersion==='inventory-insights-v1'?'inventory-suggestions-v2':configuredPromptVersion;
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>30000||!Number.isInteger(maxTokens)||maxTokens<256||maxTokens>3000||!Number.isInteger(quota)||quota<1||quota>10)throw new AppError('AI_NOT_CONFIGURED');

 return {
  provider,model,key,timeoutMs,maxTokens,quota,
  promptVersion,
  appUrl:clean(env.APP_URL)
 };
}
