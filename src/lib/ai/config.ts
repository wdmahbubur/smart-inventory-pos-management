import {AppError} from '../errors';
import {PREDICTION_PROMPT_VERSION} from './prediction-contracts';

export type AIProviderName='gemini'|'openrouter';
// User-selected OpenRouter model. Keep the API key server-only; explicit model overrides remain supported.
export const DEFAULT_OPENROUTER_MODEL='apodex/apodex-1.1-mini:free';

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

 const requestedTimeoutMs=Number(clean(env.AI_REQUEST_TIMEOUT_MS)??50000);
 // Older production environments were pinned to 30s. Full model-authored predictions can
 // legitimately take longer on free OpenRouter models, so transparently upgrade that legacy value.
 const timeoutMs=requestedTimeoutMs===30000?50000:requestedTimeoutMs;
 const requestedTokens=Number(clean(env.AI_MAX_OUTPUT_TOKENS)??9000);
 // Older deployments used 1500/6000 tokens. Reasoning-first forecasting models need enough
 // completion room for JSON plus their internal reasoning without truncating the final object.
 const maxTokens=[1500,6000].includes(requestedTokens)?9000:requestedTokens;
 const quota=Number(clean(env.AI_MAX_REQUESTS_PER_HOUR)??10);
 const configuredPromptVersion=clean(env.AI_PROMPT_VERSION);
 const promptVersion=!configuredPromptVersion||['inventory-insights-v1','inventory-suggestions-v2'].includes(configuredPromptVersion)?PREDICTION_PROMPT_VERSION:configuredPromptVersion;
 if(!/^inventory-predictions-v3(?:-[a-zA-Z0-9._-]+)?$/.test(promptVersion)||promptVersion.length>100)throw new AppError('AI_NOT_CONFIGURED');
 if(!Number.isInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000||!Number.isInteger(maxTokens)||maxTokens<2000||maxTokens>16000||!Number.isInteger(quota)||quota<1||quota>10)throw new AppError('AI_NOT_CONFIGURED');

 return {
  provider,model,key,timeoutMs,maxTokens,quota,
  promptVersion,
  appUrl:clean(env.APP_URL)
 };
}
