import {test} from 'node:test';
import assert from 'node:assert/strict';
import {predictionTotalsByUnit,projectedStockAfterOrder} from '../../src/lib/ai/prediction-display';
import {predictionFacts,predictionOutput} from '../fixtures/predictions';

test('forecast totals retain separate units and sum each product forecast once',()=>{
 const facts=predictionFacts(),output=predictionOutput();
 const pack={...facts.products[0],id:crypto.randomUUID(),unit:'pack'};
 const bottle={...facts.products[0],id:crypto.randomUUID(),unit:'bottle'};
 facts.products.push(pack,bottle);
 output.predictions.push({...output.predictions[0],product_id:pack.id,expected_units_7d:7}, {...output.predictions[0],product_id:bottle.id,expected_units_7d:5});
 const original=structuredClone(output);
 assert.deepEqual(predictionTotalsByUnit(output,facts),[{unit:'bottle',quantity:48},{unit:'pack',quantity:7}]);
 assert.deepEqual(output,original);
});
test('an omitted product forecast does not become an invented zero estimate',()=>{
 const facts=predictionFacts(),output=predictionOutput();
 output.predictions=[];
 assert.deepEqual(predictionTotalsByUnit(output,facts),[]);
});
test('additional purchase is added to stock before subtracting the same demand forecast',()=>{
 const product=predictionFacts().products[0];
 assert.deepEqual(projectedStockAfterOrder(product,43,40),{stock:5,additionalNeeded:5});
 assert.deepEqual(projectedStockAfterOrder(product,43,45),{stock:10,additionalNeeded:0});
});
test('a partial order never displays negative physical stock and shows the unmet forecast/reserve quantity',()=>{
 const product=predictionFacts().products[0];
 assert.deepEqual(projectedStockAfterOrder(product,43,2),{stock:0,additionalNeeded:43});
});
