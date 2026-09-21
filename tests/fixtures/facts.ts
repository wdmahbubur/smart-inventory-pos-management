import type {InventoryFacts,ProductForecastSignal} from '../../src/lib/ai/contracts';

const signal=(overrides:Partial<ProductForecastSignal>={}):ProductForecastSignal=>({
 id:'00000000-0000-4000-8000-000000000001',name:'Coke 500ml',sku:'DR-001',unit:'bottle',quantity:28,minimum_stock:10,
 selling_price_paisa:'6000',reference_cost_paisa:'4000',units_7d:8,units_prev_7d:5,units_30d:24,active_sale_days_30d:10,
 revenue_30d_paisa:'144000',profit_30d_paisa:'44000',trend_pct:60,forecast_7d_units:9,forecast_daily_units:1.3,
 stock_cover_days:21.5,suggested_restock_qty:0,days_without_sale:0,last_sale_at:'2026-09-18T04:20:00Z',margin_pct:33.3,
 discount_opportunity_pct:0,discounted_unit_profit_paisa:'2000',confidence:'high',...overrides
});

export function unitFacts():InventoryFacts{
 const top=signal();
 const restock=signal({id:'00000000-0000-4000-8000-000000000002',name:'Milk 1L',sku:'DA-001',quantity:3,minimum_stock:6,units_7d:6,units_prev_7d:3,units_30d:15,active_sale_days_30d:7,forecast_7d_units:7,forecast_daily_units:1,stock_cover_days:3,suggested_restock_qty:14,confidence:'medium'});
 const discount=signal({id:'00000000-0000-4000-8000-000000000003',name:'Biscuits Family Pack',sku:'SN-010',unit:'pack',quantity:12,minimum_stock:4,units_7d:0,units_prev_7d:1,units_30d:2,active_sale_days_30d:2,forecast_7d_units:1,forecast_daily_units:.1,stock_cover_days:120,suggested_restock_qty:0,days_without_sale:37,last_sale_at:'2026-08-12T05:00:00Z',margin_pct:35,discount_opportunity_pct:10,discounted_unit_profit_paisa:'1400',confidence:'low'});
 const stagnant=signal({id:'00000000-0000-4000-8000-000000000004',name:'Shampoo 180ml',sku:'PC-004',quantity:5,minimum_stock:3,units_7d:0,units_prev_7d:0,units_30d:0,active_sale_days_30d:0,forecast_7d_units:0,forecast_daily_units:0,stock_cover_days:null,suggested_restock_qty:0,days_without_sale:45,last_sale_at:null,margin_pct:30,discount_opportunity_pct:10,discounted_unit_profit_paisa:'1200',confidence:'low'});
 return {
  schema_version:'inventory-facts-v2',snapshot_at:'2026-09-18T04:35:00Z',business_date:'2026-09-18',timezone:'Asia/Dhaka',currency:'BDT',data_revision:'17',
  inventory:{active_count:7,category_count:6,in_stock:3,low_stock:3,out_of_stock:1,attention_count:4,units:69,value_paisa:'535500'},
  sales:{count:1,total_paisa:'33000',discount_paisa:'2000',units:5,cogs_paisa:'23000',net_profit_paisa:'10000'},
  purchases:{count:1,total_paisa:'205000',units:30},
  forecast:{lookback_days:56,horizon_days:7,weekday:'Thursday',weekday_factor:1.08,total_units_7d:14,total_units_prev_7d:9,total_units_30d:41,predicted_units_7d:18,top_sellers:[top,restock],restock_candidates:[restock],discount_candidates:[discount],stagnant_products:[stagnant,discount],profit_leaders:[top,restock]},
  attention:[{id:restock.id,name:restock.name,quantity:3,minimum_stock:6,unit:'bottle',shortage:3}],attention_truncated:false,
  categories:[{id:'drinks',name:'Drinks',value_paisa:'293500',product_count:2}],highest_category:{id:'drinks',name:'Drinks',value_paisa:'293500',product_count:2},
  definitions:{forecast:'Weighted recent demand; not a guarantee.',discount:'Controlled test discount with margin floor.'}
 };
}
