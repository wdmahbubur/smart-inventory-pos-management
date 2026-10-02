'use client';

import Link from 'next/link';
import {useEffect,useRef,useState} from 'react';
import {ArrowRight,RefreshCw,Sparkles,ShieldCheck} from 'lucide-react';
import {Heading,Card,Notice,Empty} from '@/components/ui';
import {money} from '@/lib/money';
import {displayDate} from '@/lib/dates';
import type {Language} from '@/lib/ai/contracts';
import type {PredictionReadResult} from '@/lib/ai/prediction-contracts';
import {predictionTotalsByUnit,projectedStockAfterOrder} from '@/lib/ai/prediction-display';

export function Insights({initialData}:{initialData:PredictionReadResult}){
 const [language,setLanguage]=useState<Language>(initialData.insight?.language??'en');
 const [data,setData]=useState(initialData),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const epoch=useRef(0),generating=useRef(false);
 useEffect(()=>{
  let active=true;const controller=new AbortController();
  const refresh=async()=>{
   if(generating.current)return;
   const version=++epoch.current;
   try{
    const response=await fetch(`/api/insights?language=${language}`,{cache:'no-store',signal:controller.signal});
    if(!response.ok)return;
    const latest:PredictionReadResult=await response.json();
    // A GET started before Generate must never overwrite the freshly generated result.
    if(active&&!generating.current&&version===epoch.current)setData(latest);
   }catch{/* Retain the visibly dated saved result on a read/network failure. */}
  };
  void refresh();
  const interval=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);
  window.addEventListener('focus',refresh);window.addEventListener('si:data-changed',refresh);
  return()=>{active=false;controller.abort();clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('si:data-changed',refresh);};
 },[language]);
 async function generate(){
  if(generating.current)return;
  generating.current=true;++epoch.current;setBusy(true);setError('');
  try{
   const response=await fetch('/api/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,regenerate:true}),signal:AbortSignal.timeout(95000)});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error?.message??'AI generation failed. Your previous saved result is unchanged.');
   if(!result.insight||result.provider_called!==true||result.cached!==false)throw new Error('No new AI result was returned. Your previous saved result is unchanged.');
   ++epoch.current;setData(result);
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'The request timed out. Your previous result is still shown; refresh the page to check whether a new result was saved.');}
  finally{generating.current=false;setBusy(false);}
 }
 const bn=language==='bn';
 const current=data.insight?.language===language?data.insight:null;
 // A saved forecast and every observation beside it must use the same snapshot.
 const facts=current?.facts_snapshot??data.context.facts;
 const result=current?.output;
 const productMap=new Map(facts.products.map(p=>[p.id,p]));
 const predictionMap=new Map(result?.predictions.map(p=>[p.product_id,p]));
 const count=(n:number)=>n.toLocaleString(bn?'bn-BD':'en-US');
 const totals=result?predictionTotalsByUnit(result,facts):[];
 const statusLabel=bn?(data.source==='provider'?'নতুন AI result':'Database-এ saved AI result'):(data.source==='provider'?'New AI result':'Saved AI result');
 return <>
  <Heading eyebrow="Insights / AI" title="AI suggestion center" description="AI-generated sales predictions, stock recommendations and promotion ideas based on your store’s sales history." actions={<div className="insight-actions"><select aria-label="Insight language" disabled={busy} value={language} onChange={e=>{setLanguage(e.target.value as Language);setError('');}}><option value="en">English</option><option value="bn">বাংলা</option></select><button className="button primary" type="button" disabled={busy} onClick={()=>void generate()}><RefreshCw size={15}/>{busy?'Generating…':current?'Generate new AI predictions':'Generate AI predictions'}</button></div>}/>

  <div className="prediction-provenance" role="status" aria-live="polite">
   <Sparkles size={17}/><div><strong>{busy?(bn?'AI এখন prediction ও suggestion তৈরি করছে…':'AI is creating new predictions and suggestions…'):current?statusLabel:(bn?'এখনও AI prediction তৈরি হয়নি':'No AI prediction generated yet')}</strong>
   <p>{current?`${current.provider} · ${current.content.response_model??current.model} · ${displayDate(current.generated_at,true)}`:(bn?'Generate চাপলে AI-তে নতুন request যাবে। Page খুললে শুধু saved result load হয়।':'Generate sends a new request to the AI model. Opening this page only loads saved results.')}</p>
   {current&&<small>{bn?'Data snapshot':'Data snapshot'}: {displayDate(current.facts_snapshot.snapshot_at,true)} · {current.prompt_version}{current.content.provider_response_id?` · Response: ${current.content.provider_response_id}`:''}</small>}</div>
  </div>
  {error&&<div className="form-message"><Notice tone="error">{error}{current&&(bn?' আগের saved result দেখানো হচ্ছে।':' Showing your previous saved result.')}</Notice></div>}
  {current?.stale&&<div className="form-message"><Notice tone="warning">{bn?'Saved prediction-এর পর data বা দিন বদলেছে। বর্তমান data দিয়ে নতুন prediction তৈরি করুন।':'Store data or the business date has changed since this prediction. Generate again before relying on it.'}</Notice></div>}
  {!current&&data.status==='legacy_result'&&<div className="form-message"><Notice>{bn?'আগের saved result শুধু priority নির্ধারণ করত। নতুন AI prediction পেতে Generate চাপুন।':'The older saved result only ranked preset suggestions. Generate to create your first full AI prediction.'}</Notice></div>}
  {!current&&data.status==='invalid_saved_result'&&<div className="form-message"><Notice tone="warning">The saved result could not be read safely. Generate a new prediction.</Notice></div>}

  <section className="suggestion-hero">
   <div><span className="insight-kicker"><Sparkles size={14}/>{bn?'AI-এর অনুমান ও পরামর্শ':'AI FORECAST & RECOMMENDATIONS'}</span><h2>{bn?'পরবর্তী ৭ দিনের জন্য ব্যবসার পরিকল্পনা':'Plan your next 7 days'}</h2>
   <p lang={language}>{result?.summary??(bn?'AI আপনার daily sales, current stock ও product cost দেখে নিজেই prediction এবং করণীয় তৈরি করবে।':'The AI will analyze daily sales, current stock and product costs, then write its own predictions and recommendations.')}</p>
   <small>{bn?'AI-এর অনুমান—নিশ্চিত বিক্রি বা লাভ নয়।':'AI estimates, not guaranteed sales or profit.'}</small></div>
   <div className="suggestion-forecast-total"><span>{bn?'আগামী ৭ দিনের আনুমানিক বিক্রি':'AI ESTIMATED SALES · NEXT 7 DAYS'}</span>{totals.length?totals.map(total=><div className="prediction-unit-total" key={total.unit}><strong>{count(total.quantity)}</strong><small>{total.unit}</small></div>):<strong>—</strong>}<em>{result?`${count(result.predictions.length)} ${bn?'product-এর forecast যোগ করে; unit আলাদা রাখা হয়েছে':'products forecast; totals grouped by unit'}`:(bn?'এখনও কোনো prediction নেই':'No prediction yet')}</em></div>
  </section>
  {result&&<p className="prediction-number-guide">{bn?'Stock = snapshot-এর মজুত · গত ৭ দিনের বিক্রি = recorded sales · Forecast = আগামী ৭ দিনের AI অনুমান · অতিরিক্ত ক্রয় = AI-এর order পরামর্শ।':'Stock is the saved snapshot quantity. Past sales are recorded history. Forecast is estimated demand for the next 7 days. Additional purchase is the AI’s suggested order quantity.'}</p>}

  <section className="suggestion-section" aria-labelledby="suggestions-title">
   <div className="suggestion-section-head"><div><span className="eyebrow">{bn?'AI-এর পরামর্শ':'WRITTEN BY AI'}</span><h2 id="suggestions-title">{bn?'কী করবেন এবং কেন':'Recommended actions & why'}</h2></div><p>{bn?'AI-এর পরামর্শ শুধু review করার জন্য। Stock বা price নিজে পরিবর্তন হবে না।':'Review these suggestions before acting. Stock and prices are never changed automatically.'}</p></div>
   {result?<div className="suggestion-card-grid prediction-action-grid">{result.suggestions.map((s,index)=>{const p=s.product_id?productMap.get(s.product_id):undefined;const forecast=s.product_id?predictionMap.get(s.product_id):undefined;const projection=p&&forecast&&s.reorder_quantity!==null?projectedStockAfterOrder(p,forecast.expected_units_7d,s.reorder_quantity):null;return <article className={`suggestion-card ${s.priority==='high'?'attention':'neutral'}`} key={`${s.product_id}-${s.action}`} lang={language}>
    <div className="suggestion-card-top"><span><Sparkles size={17}/></span><b>{count(index+1)} · {s.priority} priority</b></div><h3>{s.title}</h3>{p&&<strong className="prediction-product-name">{p.name}</strong>}<p>{s.explanation}</p>
    {p&&<dl className="prediction-product-numbers" aria-label={bn?'Product-এর সংখ্যার তুলনা':'Product quantity comparison'}><div><dt>{bn?'Snapshot-এর stock':'Stock at snapshot'}</dt><dd>{count(p.quantity)} {p.unit}</dd></div><div><dt>{bn?'গত ৭ পূর্ণ দিনের বিক্রি':'Sold in past 7 complete days'}</dt><dd>{count(p.units_7d)} {p.unit}</dd></div><div><dt>{bn?'আগামী ৭ দিনের forecast':'Forecast for next 7 days'}</dt><dd>{forecast?`${count(forecast.expected_units_7d)} ${p.unit}`:(bn?'Forecast দেওয়া হয়নি':'No forecast provided')}</dd></div></dl>}
    {(s.reorder_quantity!==null||s.discount_percent!==null)&&<div className="prediction-recommendation">{s.reorder_quantity!==null?`${bn?'অতিরিক্ত ক্রয়ের পরামর্শ':'Suggested additional purchase'}: ${count(s.reorder_quantity)} ${p?.unit??''}`:`${bn?'পরীক্ষামূলক discount':'Test discount'}: ${count(s.discount_percent!)}%`}</div>}
    {projection&&p&&<p className="prediction-order-balance">{bn?'Order যোগ করে forecast অনুযায়ী ৭ দিন পরে মজুত':'Estimated stock after this order and 7-day forecast'}: {count(projection.stock)} {p.unit} · {bn?'ন্যূনতম মজুত':'minimum stock'}: {count(p.minimum_stock)} {p.unit}.{projection.additionalNeeded>0&&<span> {bn?'Forecast ও ন্যূনতম মজুত পূরণ করতে আরও প্রয়োজন':'To cover the forecast and minimum stock, another'} {count(projection.additionalNeeded)} {p.unit}{bn?' লাগবে।':' would be needed.'}</span>}</p>}
    <p className="prediction-impact"><strong>{bn?'সম্ভাব্য উপকার':'Potential benefit'}: </strong>{s.expected_impact}</p>
    <small>{bn?'ভিত্তি':'Based on'}: {s.evidence.map(key=>key.replaceAll('_',' ')).join(' · ')}</small>
    {p&&<Link className="button" href={s.action==='restock'?`/purchases/new?products=${encodeURIComponent(p.id)}`:`/products/${encodeURIComponent(p.id)}/edit`}>{s.action==='restock'?(bn?'Purchase draft review করুন':'Review purchase draft'):(bn?'Product review করুন':'Review product')}<ArrowRight size={12}/></Link>}
   </article>;})}</div>:<Empty title={bn?'AI-কে prediction ও suggestion তৈরি করতে দিন':'Generate your first AI forecast'} description={bn?'এই অংশে AI-এর নিজের prediction, stock বা promotion suggestion এবং প্রতিটির ব্যাখ্যা আসবে।':'Your model’s predictions, stock or promotion suggestions and explanations will appear here after a successful generation.'}/>}
  </section>

  <Card title={bn?'Product অনুযায়ী AI prediction':'AI sales predictions by product'} description={bn?'Estimate ও range AI তৈরি করেছে; এগুলো নিশ্চিত ফলাফল নয়।':'Estimates and low–high ranges are generated by the model, not a database forecast formula. Ranges are not calibrated statistical intervals.'} body>
   {result?.predictions.length?<div className="ai-prediction-list">{result.predictions.map(p=>{const product=productMap.get(p.product_id)!;return <article className="ai-prediction-row" key={p.product_id} lang={language}><div><h3>{product.name}</h3><small>{product.sku} · AI confidence: {p.confidence}</small></div><div className="ai-prediction-quantity"><strong>{count(p.expected_units_7d)} {product.unit}</strong><small>{bn?'আগামী ৭ দিনের forecast':'Forecast for next 7 days'} · {bn?'সীমা':'range'} {count(p.low_units_7d)}–{count(p.high_units_7d)}</small></div><p>{p.explanation}</p><small className="ai-prediction-observed">{bn?'গত ৭ পূর্ণ দিনের বিক্রি':'Sold in past 7 complete days'}: {count(product.units_7d)} {product.unit} · {bn?'Snapshot-এর stock':'Stock at snapshot'}: {count(product.quantity)} {product.unit}</small></article>;})}</div>:<p className="muted">{result?'The AI did not provide a product forecast for this snapshot. See its limitations below.':'No AI-generated quantities are available yet.'}</p>}
  </Card>
  {result&&<div className="suggestion-columns prediction-notes"><Card title={bn?'AI-এর অনুমান':'Assumptions made by AI'} body>{result.assumptions.map((text,i)=><p lang={language} key={i}>{text}</p>)}</Card><Card title={bn?'যেখানে সতর্ক থাকতে হবে':'Limitations & uncertainty'} body>{result.limitations.map((text,i)=><p lang={language} key={i}>{text}</p>)}</Card></div>}

  <details className="prediction-facts"><summary>{current?(bn?'এই saved prediction-এর recorded data':'View the recorded data used for this saved prediction'):(bn?'AI-কে যে recorded data দেওয়া হবে':'View the recorded data for the next generation')}</summary><p>{bn?'Snapshot':'Snapshot'}: {displayDate(facts.snapshot_at,true)} · Asia/Dhaka. {bn?'পূর্ণ দিনের history':'Complete-day history'}: {facts.history_from} to {facts.history_to}. {bn?'আজকের বিক্রি আংশিক।':'Today’s sales are partial.'}</p><p>{count(facts.products.length)} / {count(facts.total_products)} {bn?'product অন্তর্ভুক্ত':'products included'}{facts.products_truncated?' (bounded analysis sample)':''}. {bn?'এগুলো recorded data, AI forecast নয়।':'These are recorded observations.'}</p>
   <div className="prediction-facts-grid">{facts.products.map(p=><div key={p.id}><strong>{p.name}</strong><small>{bn?'গত ৭ পূর্ণ দিনের বিক্রি':'Sold in past 7 complete days'}: {count(p.units_7d)} {p.unit} · {bn?'গত ৩০ দিনের বিক্রি':'Past 30 days'}: {count(p.units_30d)} {p.unit}</small><small>{bn?'Snapshot-এর stock':'Stock at snapshot'}: {count(p.quantity)} {p.unit} · {bn?'দাম':'price'} {money(p.selling_price_paisa)} · {bn?'Reference cost':'reference cost'} {money(p.reference_cost_paisa)}</small></div>)}</div>
  </details>
  <Notice tone="neutral"><ShieldCheck size={14}/>{bn?'AI-তে sales summary ও product data পাঠানো হয়; password, email বা customer details নয়। Weather, local event ও competitor price দেওয়া নেই। AI এগুলো সম্পর্কে অনুমান করলে সেটি যাচাই করুন।':'Generation sends product data and sales summaries to the configured AI provider, not passwords, emails or customer details. Live weather, local events and competitor prices are not supplied. Review model assumptions before acting.'}</Notice>
 </>;
}
