import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unitFacts} from '../fixtures/facts';
import {buildSuggestionCards,forecastConfidenceLabel} from '../../src/lib/ai/action-plan';

test('suggestion center turns bounded forecast signals into actionable cards',()=>{
 const facts=unitFacts(),cards=buildSuggestionCards(facts,'en');
 assert.equal(cards.length,4);
 assert.match(cards.find(c=>c.id==='demand')!.title,/Coke/);
 assert.match(cards.find(c=>c.id==='restock')!.href,/purchases\/new\?products=/);
 assert.match(cards.find(c=>c.id==='discount')!.description,/Demand response is uncertain/);
 assert.match(cards.find(c=>c.id==='stagnant')!.description,/45 days/);
 assert.equal(forecastConfidenceLabel(facts.forecast.top_sellers[0].confidence,'en'),'High confidence');
});

test('discount suggestion is absent when no safe discount candidate exists',()=>{
 const facts=unitFacts();facts.forecast.discount_candidates=[];
 assert.equal(buildSuggestionCards(facts,'en').some(card=>card.id==='discount'),false);
});
