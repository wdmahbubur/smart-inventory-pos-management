import type {InventoryFacts,Language} from './contracts';
import {money} from '../money';

export type InsightActionKind='stock'|'sales'|'purchases'|'inventory';
export type InsightActionTone='urgent'|'attention'|'positive'|'neutral';

export interface InsightAction {
 id:string;
 kind:InsightActionKind;
 tone:InsightActionTone;
 label:string;
 title:string;
 description:string;
 href:string;
 cta:string;
 secondaryHref?:string;
 secondaryCta?:string;
 metric:string;
}

function bnDigits(value:string){return value.replace(/[0-9]/g,d=>String.fromCharCode(0x09e6+Number(d)));}
function localNumber(value:number,language:Language){const text=String(value);return language==='bn'?bnDigits(text):text;}
function localMoney(value:string,language:Language){const text=money(value);return language==='bn'?bnDigits(text):text;}

export function stockHealthPercent(facts:InventoryFacts){
 if(facts.inventory.active_count<=0)return 100;
 return Math.max(0,Math.min(100,Math.round((facts.inventory.in_stock/facts.inventory.active_count)*100)));
}

export function buildInsightActions(facts:InventoryFacts,language:Language):InsightAction[]{
 const bn=language==='bn';
 const date=encodeURIComponent(facts.business_date);
 const attentionIds=facts.attention.filter(item=>item.shortage>0).slice(0,5).map(item=>item.id);

 const stockAction:InsightAction=facts.inventory.attention_count>0?{
  id:'stock',kind:'stock',tone:facts.inventory.out_of_stock>0?'urgent':'attention',
  label:bn?'সর্বোচ্চ অগ্রাধিকার':'Top priority',
  title:bn?`${localNumber(facts.inventory.attention_count,language)}টি পণ্যের স্টক ঠিক করুন`:`Restock ${localNumber(facts.inventory.attention_count,language)} products`,
  description:bn
   ?`${localNumber(facts.inventory.out_of_stock,language)}টি out of stock এবং ${localNumber(facts.inventory.low_stock,language)}টি minimum-এর নিচে। Suggested gap review করে supplier ও quantity নিশ্চিত করুন।`
   :`${localNumber(facts.inventory.out_of_stock,language)} are out of stock and ${localNumber(facts.inventory.low_stock,language)} are below minimum. Review suggested gaps, supplier and quantities before receiving.`,
  href:attentionIds.length?`/purchases/new?products=${attentionIds.join(',')}`:'/inventory/low-stock',
  cta:bn?'Replenishment purchase তৈরি করুন':'Create replenishment purchase',
  secondaryHref:'/inventory/low-stock',secondaryCta:bn?'সব stock alert দেখুন':'Review all stock alerts',
  metric:`${localNumber(facts.inventory.out_of_stock,language)} / ${localNumber(facts.inventory.low_stock,language)}`
 }:{
  id:'stock',kind:'stock',tone:'positive',label:bn?'স্টক অবস্থান':'Stock position',
  title:bn?'সব active পণ্য minimum পূরণ করছে':'All active products meet minimum',
  description:bn?'বর্তমান recorded minimum অনুযায়ী কোনো low-stock বা out-of-stock alert নেই।':'There are no low-stock or out-of-stock alerts against recorded minimums.',
  href:'/inventory',cta:bn?'Inventory দেখুন':'View inventory',metric:'100%'
 };

 const salesAction:InsightAction=facts.sales.count>0?{
  id:'sales',kind:'sales',tone:'positive',label:bn?'আজকের বিক্রয়':'Today’s sales',
  title:bn?`${localNumber(facts.sales.count,language)}টি sale · ${localMoney(facts.sales.total_paisa,language)}`:`${localNumber(facts.sales.count,language)} sales · ${localMoney(facts.sales.total_paisa,language)}`,
  description:bn?`আজ ${localNumber(facts.sales.units,language)}টি selling unit বিক্রি হয়েছে। Net sales review করে receipt-level detail দেখুন।`:`${localNumber(facts.sales.units,language)} selling units were sold today. Review net sales and receipt-level detail.`,
  href:`/reports/sales?from=${date}&to=${date}`,cta:bn?'Sales report খুলুন':'Open sales report',
  secondaryHref:'/sales',secondaryCta:bn?'Receipts দেখুন':'View receipts',metric:localMoney(facts.sales.total_paisa,language)
 }:{
  id:'sales',kind:'sales',tone:'neutral',label:bn?'আজকের বিক্রয়':'Today’s sales',
  title:bn?'আজ এখনো completed sale নেই':'No completed sale yet today',
  description:bn?'পরবর্তী customer sale শুরু করতে POS খুলুন।':'Open POS when the next customer sale starts.',
  href:'/pos',cta:bn?'POS খুলুন':'Open POS',metric:localMoney('0',language)
 };

 const purchaseAction:InsightAction=facts.purchases.count>0?{
  id:'purchases',kind:'purchases',tone:'neutral',label:bn?'আজকের stock in':'Today’s stock in',
  title:bn?`${localNumber(facts.purchases.count,language)}টি received purchase`:`${localNumber(facts.purchases.count,language)} received purchases`,
  description:bn?`আজ received goods-এর recorded value ${localMoney(facts.purchases.total_paisa,language)}। Draft purchase এই মোটে নেই।`:`Today’s received goods total ${localMoney(facts.purchases.total_paisa,language)}. Draft purchases are excluded.`,
  href:`/reports/purchases?from=${date}&to=${date}`,cta:bn?'Purchase report খুলুন':'Open purchase report',
  secondaryHref:'/purchases',secondaryCta:bn?'Purchase history':'Purchase history',metric:localMoney(facts.purchases.total_paisa,language)
 }:{
  id:'purchases',kind:'purchases',tone:facts.inventory.attention_count>0?'attention':'neutral',label:bn?'আজকের stock in':'Today’s stock in',
  title:bn?'আজ কোনো purchase receive হয়নি':'No purchase received today',
  description:bn?'প্রয়োজনে supplier select করে goods received record করুন। Draft save করলে stock বদলাবে না।':'Record received goods when stock arrives. Saving a draft will not change stock.',
  href:'/purchases/new',cta:bn?'নতুন purchase':'New purchase',metric:localMoney('0',language)
 };

 const inventoryAction:InsightAction={
  id:'inventory',kind:'inventory',tone:'neutral',label:bn?'Stock value snapshot':'Stock value snapshot',
  title:bn?`Estimated stock ${localMoney(facts.inventory.value_paisa,language)}`:`Estimated stock ${localMoney(facts.inventory.value_paisa,language)}`,
  description:facts.highest_category
   ?(bn?`${facts.highest_category.name} category-তে সর্বোচ্চ reference-cost estimate আছে। এটি accounting valuation বা profit নয়।`:`${facts.highest_category.name} has the highest current reference-cost estimate. This is not accounting valuation or profit.`)
   :(bn?'Current reference cost অনুযায়ী inventory mix review করুন।':'Review the current inventory mix using reference costs.'),
  href:'/reports/inventory',cta:bn?'Inventory report খুলুন':'Open inventory report',metric:`${stockHealthPercent(facts)}%`
 };

 return [stockAction,salesAction,purchaseAction,inventoryAction];
}
