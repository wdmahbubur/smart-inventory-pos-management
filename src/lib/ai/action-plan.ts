import type {InventoryFacts,Language,ProductForecastSignal} from './contracts';
import {money} from '../money';

export type SuggestionKind='demand'|'restock'|'discount'|'stagnant';
export type SuggestionTone='positive'|'attention'|'neutral'|'urgent';
export interface SuggestionCard {
 id:string;
 kind:SuggestionKind;
 title:string;
 description:string;
 metric:string;
 detail:string;
 href:string;
 cta:string;
 confidence?:ProductForecastSignal['confidence'];
 tone:SuggestionTone;
}

function digits(value:string,language:Language){return language==='bn'?value.replace(/[0-9]/g,d=>String.fromCharCode(0x09e6+Number(d))):value;}
function n(value:number,language:Language){return digits(String(value),language);}
function m(value:string,language:Language){return digits(money(value),language);}
function roundedDays(value:number){return Math.max(1,Math.round(value));}

export function forecastConfidenceLabel(value:ProductForecastSignal['confidence'],language:Language){
 const bn=language==='bn';
 return value==='high'?(bn?'ভালো sales history':'Strong sales history'):value==='medium'?(bn?'কিছু sales history':'Some sales history'):(bn?'কম sales history':'Limited sales history');
}

export function recentTrendLabel(item:ProductForecastSignal,language:Language){
 const bn=language==='bn';
 if(item.units_prev_7d===0){
  if(item.units_7d>0)return bn?'এই সপ্তাহে নতুন sales এসেছে':'Sales started this week';
  return bn?'গত ৭ দিনে sale হয়নি':'No sales in the last 7 days';
 }
 const pct=Math.abs(item.trend_pct);
 if(item.trend_pct===0)return bn?'আগের ৭ দিনের মতোই sales':'Sales are unchanged vs previous 7 days';
 return item.trend_pct>0
  ?(bn?`আগের ৭ দিনের চেয়ে ${n(pct,language)}% বেশি sales`:`${n(pct,language)}% more sales vs previous 7 days`)
  :(bn?`আগের ৭ দিনের চেয়ে ${n(pct,language)}% কম sales`:`${n(pct,language)}% fewer sales vs previous 7 days`);
}

export function stockCoverLabel(value:number|null,language:Language){
 const bn=language==='bn';
 if(value===null)return bn?'Recent demand নেই':'No recent demand estimate';
 const days=n(roundedDays(value),language);
 return bn?`বর্তমান stock প্রায় ${days} দিন চলতে পারে`:`About ${days} days of stock left`;
}

export function buildSuggestionCards(facts:InventoryFacts,language:Language):SuggestionCard[]{
 const bn=language==='bn',f=facts.forecast;
 const top=f.top_sellers[0],restock=f.restock_candidates[0],discount=f.discount_candidates[0],stale=f.stagnant_products[0];
 const cards:SuggestionCard[]=[];
 if(top)cards.push({
  id:'demand',kind:'demand',tone:'positive',confidence:top.confidence,
  title:bn?`${top.name} সবচেয়ে বেশি বিক্রি হচ্ছে`:`${top.name} is your top-selling product`,
  description:bn
   ?`গত ৩০ দিনে ${n(top.units_30d,language)} ${top.unit} বিক্রি হয়েছে। সাম্প্রতিক sales pattern ধরে আগামী ৭ দিনে প্রায় ${n(top.forecast_7d_units,language)} ${top.unit} বিক্রি হতে পারে।`
   :`${n(top.units_30d,language)} ${top.unit} sold in the last 30 days. Based on recent sales patterns, about ${n(top.forecast_7d_units,language)} ${top.unit} may sell in the next 7 days.`,
  metric:bn?`আগামী ৭ দিনে প্রায় ${n(top.forecast_7d_units,language)}`:`About ${n(top.forecast_7d_units,language)} expected in 7 days`,
  detail:`${forecastConfidenceLabel(top.confidence,language)} · ${recentTrendLabel(top,language)}`,
  href:'/reports/sales',cta:bn?'Sales report দেখুন':'View sales report'
 });
 if(restock)cards.push({
  id:'restock',kind:'restock',tone:restock.stock_cover_days!==null&&restock.stock_cover_days<7?'urgent':'attention',confidence:restock.confidence,
  title:bn?`${restock.name}-এর stock বাড়ানোর কথা ভাবুন`:`Consider restocking ${restock.name}`,
  description:bn
   ?`এখন ${n(restock.quantity,language)} ${restock.unit} stock আছে। Forecast ও safety buffer ধরে আরও প্রায় ${n(restock.suggested_restock_qty,language)} ${restock.unit} review করা ভালো।`
   :`You have ${n(restock.quantity,language)} ${restock.unit} in stock. Based on forecast demand and a safety buffer, review adding about ${n(restock.suggested_restock_qty,language)} more ${restock.unit}.`,
  metric:stockCoverLabel(restock.stock_cover_days,language),
  detail:`${forecastConfidenceLabel(restock.confidence,language)} · ${bn?'আগামী ৭ দিনে প্রায়':'About'} ${n(restock.forecast_7d_units,language)} ${restock.unit} ${bn?'বিক্রি হতে পারে':'expected next 7 days'}`,
  href:`/purchases/new?products=${restock.id}`,cta:bn?'Purchase draft খুলুন':'Open purchase draft'
 });
 if(discount)cards.push({
  id:'discount',kind:'discount',tone:'neutral',
  title:bn?`${discount.name}-এ ছোট discount test বিবেচনা করুন`:`Consider a small discount test on ${discount.name}`,
  description:bn
   ?`পণ্যটি ${n(discount.days_without_sale??0,language)} দিন sale ছাড়া আছে। ${n(discount.discount_opportunity_pct,language)}% test discount দিলেও current reference cost ধরে unit profit প্রায় ${m(discount.discounted_unit_profit_paisa,language)} থাকতে পারে। Demand বাড়বে—এটা নিশ্চিত নয়।`
   :`This item has gone ${n(discount.days_without_sale??0,language)} days without a sale. A ${n(discount.discount_opportunity_pct,language)}% test discount would still leave about ${m(discount.discounted_unit_profit_paisa,language)} estimated unit profit using the current reference cost. More demand is not guaranteed.`,
  metric:bn?`${n(discount.discount_opportunity_pct,language)}% test discount`:`${n(discount.discount_opportunity_pct,language)}% test discount`,
  detail:bn?`${n(discount.quantity,language)} stock আছে · current margin ${n(discount.margin_pct,language)}%`:`${n(discount.quantity,language)} in stock · current margin ${n(discount.margin_pct,language)}%`,
  href:'/products',cta:bn?'Product pricing দেখুন':'Review product pricing'
 });
 if(stale)cards.push({
  id:'stagnant',kind:'stagnant',tone:'attention',
  title:bn?`${stale.name} অনেক দিন ধরে বিক্রি হচ্ছে না`:`${stale.name} has been sitting in stock`,
  description:bn
   ?`${n(stale.days_without_sale??0,language)} দিন sale হয়নি, কিন্তু ${n(stale.quantity,language)} ${stale.unit} stock আছে। Reorder pause, display change, promotion test বা price review বিবেচনা করুন।`
   :`There has been no sale for ${n(stale.days_without_sale??0,language)} days while ${n(stale.quantity,language)} ${stale.unit} remain in stock. Consider pausing reorder, changing the display, testing a promotion, or reviewing the price.`,
  metric:bn?`${n(stale.days_without_sale??0,language)} দিন sale নেই`:`No sale for ${n(stale.days_without_sale??0,language)} days`,
  detail:bn?`${n(stale.quantity,language)} ${stale.unit} stock-এ আছে`:`${n(stale.quantity,language)} ${stale.unit} still in stock`,
  href:'/inventory',cta:bn?'Inventory দেখুন':'View inventory'
 });
 return cards;
}
