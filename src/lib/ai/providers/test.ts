import type {InventoryInsightProvider,InventoryFacts,Language,RequestContext} from '../contracts';
import {expandSelection} from '../grounding';
export class DeterministicTestProvider implements InventoryInsightProvider{
 readonly name='test';readonly model='deterministic-test-v2';
 constructor(){if(process.env.NODE_ENV!=='test')throw new Error('The deterministic provider is restricted to explicit automated tests.');}
 async generateInventoryInsights(_facts:InventoryFacts,_language:Language,context:RequestContext){
  const keys=(['demand','restock','discount','stagnant','profit'] as const).filter(key=>context.policy.sections[key]).slice(0,4);
  if(!keys.length)throw new Error('No grounded suggestion sections are available.');
  return expandSelection({summary_key:'growth',section_keys:keys},context.policy);
 }
}
