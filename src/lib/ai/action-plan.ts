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

export function forecastConfidenceLabel(value:ProductForecastSignal['confidence'],language:Language){
 const bn=language==='bn';
 return value==='high'?(bn?'উচ্চ confidence':'High confidence'):value==='medium'?(bn?'মাঝারি confidence':'Medium confidence'):(bn?'কম confidence':'Low confidence');
}

export function buildSuggestionCards(facts:InventoryFacts,language:Language):SuggestionCard[]{
 const bn=language==='bn',f=facts.forecast;
 const top=f.top_sellers[0],restock=f.restock_candidates[0],discount=f.discount_candidates[0],stale=f.stagnant_products[0];
 const cards:SuggestionCard[]=[];
 if(top)cards.push({
  id:'demand',kind:'demand',tone:'positive',confidence:top.confidence,
  title:bn?`${top.name} সবচেয়ে বেশি বিক্রি হচ্ছে`:`${top.name} is leading demand`,
  description:bn
   ?`গত ৩০ দিনে ${n(top.units_30d,language)} ${top.unit} বিক্রি হয়েছে। সাম্প্রতিক velocity, trend ও weekday pattern ধরে আগামী ৭ দিনে প্রায় ${n(top.forecast_7d_units,language)} ${top.unit} demand হতে পারে।`
   :`${n(top.units_30d,language)} ${top.unit} sold in the last 30 days. Based on recent velocity, trend and weekday pattern, about ${n(top.forecast_7d_units,language)} ${top.unit} may sell over the next 7 days.`,
  metric:`${n(top.forecast_7d_units,language)} / 7d`,
  detail:`${forecastConfidenceLabel(top.confidence,language)} · ${top.trend_pct>=0?'+':''}${n(top.trend_pct,language)}% trend`,
  href:'/reports/sales',cta:bn?'Sales report দেখুন':'Open sales report'
 });
 if(restock)cards.push({
  id:'restock',kind:'restock',tone:restock.stock_cover_days!==null&&restock.stock_cover_days<7?'urgent':'attention',confidence:restock.confidence,
  title:bn?`${restock.name} stock বাড়ান`:`Increase ${restock.name} stock`,
  description:bn
   ?`বর্তমান stock ${n(restock.quantity,language)} ${restock.unit}। Forecast অনুযায়ী ১৪ দিনের demand ও safety buffer ধরলে প্রায় ${n(restock.suggested_restock_qty,language)} ${restock.unit} অতিরিক্ত stock review করা উচিত।`
   :`Current stock is ${n(restock.quantity,language)} ${restock.unit}. A 14-day demand target plus safety buffer suggests reviewing about ${n(restock.suggested_restock_qty,language)} additional ${restock.unit}.`,
  metric:restock.stock_cover_days===null?'—':`${n(restock.stock_cover_days,language)}d cover`,
  detail:`${forecastConfidenceLabel(restock.confidence,language)} · next 7d ${n(restock.forecast_7d_units,language)} ${restock.unit}`,
  href:`/purchases/new?products=${restock.id}`,cta:bn?'Purchase draft খুলুন':'Open purchase draft'
 });
 if(discount)cards.push({
  id:'discount',kind:'discount',tone:'neutral',
  title:bn?`${discount.name}-এ ${n(discount.discount_opportunity_pct,language)}% test discount বিবেচনা করুন`:`Consider a ${n(discount.discount_opportunity_pct,language)}% test discount on ${discount.name}`,
  description:bn
   ?`পণ্যটি ${n(discount.days_without_sale??0,language)} দিন sale ছাড়া আছে। এই discount-এর পরও বর্তমান reference cost ধরে unit profit প্রায় ${m(discount.discounted_unit_profit_paisa,language)} থাকবে। Demand response নিশ্চিত নয়—ছোট test campaign হিসেবে ব্যবহার করুন।`
   :`The item has gone ${n(discount.days_without_sale??0,language)} days without a sale. At this discount, estimated unit profit remains about ${m(discount.discounted_unit_profit_paisa,language)} using current reference cost. Demand response is uncertain, so use it as a small test campaign.`,
  metric:`${n(discount.discount_opportunity_pct,language)}% test`,detail:`margin ${n(discount.margin_pct,language)}% · ${n(discount.quantity,language)} in stock`,
  href:'/products',cta:bn?'Product pricing দেখুন':'Review product pricing'
 });
 if(stale)cards.push({
  id:'stagnant',kind:'stagnant',tone:'attention',
  title:bn?`${stale.name} slow-moving stock`:`${stale.name} is slow-moving stock`,
  description:bn
   ?`${n(stale.days_without_sale??0,language)} দিন ধরে sale নেই, কিন্তু ${n(stale.quantity,language)} ${stale.unit} stock আছে। Reorder pause, display/promotion test, অথবা price review বিবেচনা করুন।`
   :`There has been no sale for ${n(stale.days_without_sale??0,language)} days while ${n(stale.quantity,language)} ${stale.unit} remain in stock. Consider pausing reorder, testing merchandising/promotion, or reviewing price.`,
  metric:`${n(stale.days_without_sale??0,language)} days`,detail:`${n(stale.quantity,language)} ${stale.unit} on hand`,
  href:'/inventory',cta:bn?'Inventory দেখুন':'Open inventory'
 });
 return cards;
}
