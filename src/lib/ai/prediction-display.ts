import type {PredictionFacts,PredictionOutput,PredictionProduct} from './prediction-contracts';

/** Advisory stock arithmetic uses the same model estimate displayed on the page. */
export function projectedStockAfterOrder(product:PredictionProduct,forecastUnits:number,additionalUnits:number){
 const balance=product.quantity+additionalUnits-forecastUnits;
 return {stock:Math.max(0,balance),additionalNeeded:Math.max(0,product.minimum_stock-balance)};
}

/** Count forecasts once, retaining the product's unit rather than mixing units. */
export function predictionTotalsByUnit(output:PredictionOutput,facts:PredictionFacts){
 const products=new Map(facts.products.map(product=>[product.id,product]));
 const totals=new Map<string,number>();
 for(const prediction of output.predictions){
  const product=products.get(prediction.product_id);
  if(!product)continue;
  totals.set(product.unit,(totals.get(product.unit)??0)+prediction.expected_units_7d);
 }
 return Array.from(totals,([unit,quantity])=>({unit,quantity}));
}
