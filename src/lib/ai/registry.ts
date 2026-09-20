import 'server-only';
import {readAIConfig} from './config';
import {GeminiProvider} from './providers/gemini';
import {OpenRouterProvider} from './providers/openrouter';

export function configuredProvider(){
 const config=readAIConfig(process.env);
 const provider=config.provider==='openrouter'
  ? new OpenRouterProvider(config.model,config.key,config.maxTokens,fetch,config.appUrl)
  : new GeminiProvider(config.model,config.key,config.maxTokens);
 return {config,provider};
}
// Production vendors must implement InventoryInsightProvider and be explicitly registered.
// Test adapters are intentionally absent from the production registry.
