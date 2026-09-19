import type {InventoryInsightProvider,InventoryFacts,Language,RequestContext} from '../contracts';
import {expandSelection} from '../grounding';
export class DeterministicTestProvider implements InventoryInsightProvider{
 readonly name='test';readonly model='deterministic-test-v1';
 constructor(){if(process.env.NODE_ENV!=='test')throw new Error('The deterministic provider is restricted to explicit automated tests.');}
 async generateInventoryInsights(_facts:InventoryFacts,_language:Language,context:RequestContext){return expandSelection({summary_key:'attention',section_keys:context.policy.sections.category?['stock','category','activity']:['stock','activity']},context.policy);}
}
