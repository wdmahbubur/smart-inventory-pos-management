import {test} from 'node:test';
import assert from 'node:assert/strict';
import {unitFacts} from '../fixtures/facts';
import {buildInsightActions,stockHealthPercent} from '../../src/lib/ai/action-plan';

test('AI decision actions use verified facts and link to executable business workflows',()=>{
 const facts=unitFacts();
 const actions=buildInsightActions(facts,'en');
 assert.equal(actions.length,4);
 const stock=actions.find(action=>action.id==='stock')!;
 assert.ok(stock.href.startsWith('/purchases/new?products=')||stock.href==='/inventory/low-stock');
 assert.equal(stock.secondaryHref,'/inventory/low-stock');
 const sales=actions.find(action=>action.id==='sales')!;
 assert.ok(sales.href.startsWith('/reports/sales?from='));
 const purchases=actions.find(action=>action.id==='purchases')!;
 assert.ok(purchases.href.startsWith('/reports/purchases?from=')||purchases.href==='/purchases/new');
 assert.equal(actions.find(action=>action.id==='inventory')?.href,'/reports/inventory');
 assert.equal(stockHealthPercent(facts),Math.round((facts.inventory.in_stock/facts.inventory.active_count)*100));
});

test('healthy stock action does not invent a replenishment need',()=>{
 const base=unitFacts();
 const healthy={...base,inventory:{...base.inventory,active_count:4,in_stock:4,low_stock:0,out_of_stock:0,attention_count:0},attention:[]};
 const stock=buildInsightActions(healthy,'en')[0];
 assert.equal(stock.tone,'positive');
 assert.equal(stock.href,'/inventory');
 assert.match(stock.title,/meet minimum/i);
 assert.equal(stockHealthPercent(healthy),100);
});
