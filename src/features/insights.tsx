'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import {ArrowRight,BadgePercent,BarChart3,Clock3,PackagePlus,RefreshCw,ShieldCheck,Sparkles,TrendingUp} from 'lucide-react';
import {Heading,Card,Notice,Empty} from '@/components/ui';
import {money} from '@/lib/money';
import {displayDate} from '@/lib/dates';
import {buildSuggestionCards,forecastConfidenceLabel,type SuggestionKind} from '@/lib/ai/action-plan';
import type {InsightContext,DeliveredInsight,Language,ProductForecastSignal} from '@/lib/ai/contracts';

const suggestionIcons:Record<SuggestionKind,typeof TrendingUp>={demand:TrendingUp,restock:PackagePlus,discount:BadgePercent,stagnant:Clock3};
function localNumber(value:number,language:Language){const text=String(value);return language==='bn'?text.replace(/[0-9]/g,d=>String.fromCharCode(0x09e6+Number(d))):text;}
function signed(value:number,language:Language){return `${value>0?'+':''}${localNumber(value,language)}%`;}
function confidenceClass(value:ProductForecastSignal['confidence']){return value==='high'?'received':value==='medium'?'low_stock':'draft';}

export function Insights({initialContext,initialInsight}:{initialContext:InsightContext;initialInsight:DeliveredInsight|null}){
 const [language,setLanguage]=useState<Language>(initialInsight?.language??'bn');
 const [context,setContext]=useState(initialContext);
 const [insight,setInsight]=useState(initialInsight);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 useEffect(()=>{
  let active=true;
  const refresh=async()=>{try{const response=await fetch(`/api/insights?language=${language}`,{cache:'no-store'});const data=await response.json();if(active&&response.ok){setContext(data.context);setInsight(data.insight);}}catch{/* Keep the last visibly dated forecast snapshot. */}};
  void refresh();
  const interval=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},60000);
  window.addEventListener('focus',refresh);window.addEventListener('si:data-changed',refresh);
  return()=>{active=false;clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('si:data-changed',refresh);};
 },[language]);

 async function generate(regenerate:boolean){
  setBusy(true);setError('');
  try{
   const response=await fetch('/api/insights',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({language,regenerate}),signal:AbortSignal.timeout(40000)});
   const data=await response.json();if(!response.ok)throw new Error(data.error?.message??'AI could not complete this request.');setContext(data.context);setInsight(data.insight);
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'The AI response was interrupted. Forecasts and deterministic suggestions remain available.');}
  finally{setBusy(false);}
 }

 const facts=context.facts,forecast=facts.forecast,current=insight?.language===language?insight:null,bn=language==='bn';
 const cards=buildSuggestionCards(facts,language);

 return <>
  <Heading eyebrow="Insights / AI" title="AI suggestion center" description="Demand forecasts, stock and pricing opportunities, slow-moving inventory, and grounded explanations designed to help you find better profit opportunities." actions={<div className="insight-actions"><select aria-label="Insight language" disabled={busy} value={language} onChange={e=>{setLanguage(e.target.value as Language);setError('');}}><option value="bn">বাংলা</option><option value="en">English</option></select><button className="button primary" type="button" disabled={busy} onClick={()=>void generate(!!current)}><RefreshCw size={15}/>{busy?'Generating…':current?'Refresh suggestions':'Generate AI suggestions'}</button></div>}/>

  <section className="suggestion-hero">
   <div>
    <span className="insight-kicker"><Sparkles size={14}/>{bn?'PROFIT GROWTH SIGNALS':'PROFIT GROWTH SIGNALS'}</span>
    <h2>{bn?'আগামী demand বুঝে stock ও pricing সিদ্ধান্ত নিন':'Use projected demand to guide stock and pricing'}</h2>
    <p>{bn?'গত ৫৬ দিনের sales history, recent ৭/৩০ দিনের velocity, trend, weekday pattern, margin এবং current stock ব্যবহার করে suggestion তৈরি হচ্ছে।':'Suggestions use 56 days of sales history, recent 7/30-day velocity, trend, weekday pattern, margin and current stock.'}</p>
    <div className="suggestion-hero-actions"><Link className="button" href="/reports/sales"><BarChart3 size={14}/>{bn?'Sales history':'Sales history'}</Link><small>{bn?'Forecast decision support—guarantee নয়।':'Forecasts are decision support, not guarantees.'}</small></div>
   </div>
   <div className="suggestion-forecast-total"><span>NEXT 7 DAYS</span><strong>{localNumber(forecast.predicted_units_7d,language)}</strong><small>{bn?'projected selling units':'projected selling units'}</small><em>{forecast.weekday} · {localNumber(Math.round(forecast.weekday_factor*100),language)}% weekday factor</em></div>
  </section>

  <div className="suggestion-metrics">
   <div><span>{bn?'গত ৩০ দিনের units':'Units sold · 30d'}</span><strong>{localNumber(forecast.total_units_30d,language)}</strong><small>{bn?'সব completed sales':'all completed sales'}</small></div>
   <div><span>{bn?'আজকের net profit':'Net profit today'}</span><strong>{money(facts.sales.net_profit_paisa??'0')}</strong><small>{bn?'captured product cost বাদে':'after captured product cost'}</small></div>
   <div><span>{bn?'Restock suggestion':'Restock candidates'}</span><strong>{localNumber(forecast.restock_candidates.length,language)}</strong><small>{bn?'forecast + safety cover':'forecast + safety cover'}</small></div>
   <div><span>{bn?'Slow-moving stock':'Slow-moving products'}</span><strong>{localNumber(forecast.stagnant_products.length,language)}</strong><small>{bn?'৩০+ দিন sale নেই':'30+ days without a sale'}</small></div>
  </div>

  <section className="suggestion-section" aria-labelledby="suggestions-title">
   <div className="suggestion-section-head"><div><span className="eyebrow">AI suggestions</span><h2 id="suggestions-title">{bn?'এখন কী করা যেতে পারে':'What you can act on now'}</h2></div><p>{bn?'প্রতিটি suggestion verified database signal থেকে আসে। AI stock, price বা purchase নিজে পরিবর্তন করতে পারে না।':'Each suggestion comes from verified database signals. AI cannot change stock, price or purchases.'}</p></div>
   {cards.length?<div className="suggestion-card-grid">{cards.map(card=>{const Icon=suggestionIcons[card.kind];return <article className={`suggestion-card ${card.tone}`} key={card.id}><div className="suggestion-card-top"><span><Icon size={17}/></span><b>{card.metric}</b></div><h3>{card.title}</h3><p>{card.description}</p><small>{card.detail}</small><Link className="button" href={card.href}>{card.cta}<ArrowRight size={12}/></Link></article>;})}</div>:<Empty title={bn?'এখনও যথেষ্ট sales history নেই':'Not enough sales history yet'} description={bn?'Sales history বাড়লে demand, restock, discount এবং slow-stock suggestion এখানে দেখা যাবে।':'As sales history grows, demand, restock, discount and slow-stock suggestions will appear here.'}/>} 
  </section>

  <div className="suggestion-columns">
   <Card title={bn?'Demand forecast by product':'Demand forecast by product'} description={bn?'Top-selling products, recent trend এবং আগামী ৭ দিনের projected demand।':'Top-selling products, recent trend and projected demand for the next 7 days.'} body>
    {forecast.top_sellers.length?<div className="forecast-list">{forecast.top_sellers.slice(0,8).map((item,index)=><div className="forecast-row" key={item.id}><span className="forecast-rank">{index+1}</span><div className="forecast-product"><strong>{item.name}</strong><small>{item.sku} · {localNumber(item.units_30d,language)} sold / 30d</small></div><div className="forecast-trend"><span className={item.trend_pct>=0?'green':'red'}>{signed(item.trend_pct,language)}</span><small>recent trend</small></div><div className="forecast-number"><strong>{localNumber(item.forecast_7d_units,language)}</strong><small>next 7d</small></div><div className="forecast-number"><strong>{item.stock_cover_days===null?'—':localNumber(item.stock_cover_days,language)}</strong><small>days cover</small></div><span className={`badge ${confidenceClass(item.confidence)}`}>{forecastConfidenceLabel(item.confidence,language)}</span></div>)}</div>:<Empty title="No demand signal yet" description="Complete more sales to build a product-level forecast."/>}
   </Card>

   <Card title={bn?'Profit opportunities':'Profit opportunities'} description={bn?'Recent product profit ও margin দেখে availability priority।':'Prioritize availability using recent product profit and margin.'} body>
    {forecast.profit_leaders.length?<div className="profit-list">{forecast.profit_leaders.slice(0,6).map(item=><div className="profit-row" key={item.id}><div><strong>{item.name}</strong><small>{localNumber(item.units_30d,language)} sold · margin {localNumber(item.margin_pct,language)}%</small></div><div><strong>{money(item.profit_30d_paisa)}</strong><small>{bn?'est. 30d product profit':'est. 30d product profit'}</small></div></div>)}</div>:<p className="muted">{bn?'এখনও product profit history নেই।':'No product profit history is available yet.'}</p>}
   </Card>
  </div>

  <div className="suggestion-columns ai-suggestion-bottom">
   <Card title={bn?'AI explanation':'AI explanation'} description={bn?'Calculated signals-এর ওপর grounded explanation; নতুন সংখ্যা AI invent করতে পারে না।':'A grounded explanation of calculated signals; AI cannot invent new numbers.'} className="insight-panel" body>
    {error&&<div className="form-message"><Notice tone="error">{error}</Notice></div>}
    {current?<div className="insight-readout">{current.stale&&<div className="form-message"><Notice tone="warning">This saved explanation is stale because store data changed. Refresh suggestions before using it.</Notice></div>}<div className="insight-readout-meta"><span className="insight-provider"><Sparkles size={12}/>{current.provider}<b>·</b>{current.model}</span><span>{displayDate(current.generated_at,true)}</span></div><div lang={language} className="insight-summary"><p>{current.output.summary}</p></div><div className="insight-readout-sections">{current.output.sections.map((section,index)=><section key={index} className="insight-section" lang={language}><h3>{section.heading}</h3><p>{section.explanation}</p></section>)}</div><div className="insight-audit"><ShieldCheck size={14}/><span>Fact snapshot {displayDate(current.facts_snapshot.snapshot_at,true)} · Revision {current.store_data_revision} · {current.prompt_version}</span></div></div>:<Empty title={busy?(bn?'Suggestion তৈরি হচ্ছে…':'Preparing suggestions…'):(bn?'Forecast প্রস্তুত—AI explanation optional':'Forecast is ready—AI explanation is optional')} description={bn?'উপরের forecast ও deterministic suggestions provider ছাড়া কাজ করে। AI button চাপলে এগুলো explain এবং prioritize করবে।':'The forecasts and deterministic suggestions above work without an AI provider. Generate AI suggestions to explain and prioritize them.'}/>} 
   </Card>

   <Card title={bn?'Prediction কীভাবে তৈরি হয়':'How the prediction works'} description={`Snapshot: ${displayDate(facts.snapshot_at,true)} · Asia/Dhaka`} body>
    <ul className="suggestion-method">
     <li><strong>7/30-day sales velocity</strong><span>Recent demand and a longer baseline are weighted together.</span></li>
     <li><strong>Recent trend</strong><span>The last 7 days are compared with the previous 7 days, with caps to reduce spikes.</span></li>
     <li><strong>Weekday environment</strong><span>A bounded 56-day store-wide weekday pattern adjusts the short forecast.</span></li>
     <li><strong>Margin & stock cover</strong><span>Current reference cost, selling price and quantity drive restock and discount headroom.</span></li>
     <li><strong>Slow-stock signal</strong><span>30+ days without a completed sale while stock remains triggers review.</span></li>
    </ul>
    <Notice tone="neutral"><ShieldCheck size={14}/>{bn?'Weather, local event, competitor price বা external market data এখন app-এ নেই—AI এগুলো জানে বলে ধরে নেয় না।':'Weather, local events, competitor pricing and external market data are not currently ingested, so AI does not pretend to know them.'}</Notice>
   </Card>
  </div>
 </>;
}
