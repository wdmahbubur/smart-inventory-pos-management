import 'server-only';
import {readAIConfig} from './config';
import {GeminiProvider} from './providers/gemini';
export function configuredProvider(){const config=readAIConfig(process.env);return {config,provider:new GeminiProvider(config.model,config.key,config.maxTokens)};}
// Additional production vendors must implement InventoryInsightProvider and be explicitly registered.
// Test adapters are intentionally absent from the production registry.
