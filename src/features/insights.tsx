'use client';

import Link from 'next/link';
import {useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
import {ArrowRight,BarChart3,Boxes,ClipboardList,PackagePlus,RefreshCw,ShieldCheck,ShoppingCart,Sparkles,Truck} from 'lucide-react';
import {Heading,Card,Notice,Empty,Status} from '@/components/ui';
import {money} from '@/lib/money';
import {displayDate} from '@/lib/dates';
import {buildInsightActions,stockHealthPercent,type InsightActionKind} from '@/lib/ai/action-plan';
import type {InsightContext,DeliveredInsight,Language} from '@/lib/ai/contracts';

const actionIcons:Record<InsightActionKind,typeof Boxes>={stock:PackagePlus,sales:ShoppingCart,purchases:Truck,inventory:BarChart3};
function localNumber(value:number,language:Language){const text=String(value);return language==='bn'?text.replace(/[0-9]/g,d=>String.fromCharCode(0x09e6+Number(d))):text;}

export function Insights({initialContext,initialInsight}:{initialContext:InsightContext;initialInsight:DeliveredInsight|null}){
 const [language,setLanguage]=useState<Language>(initialInsight?.language??'bn');
 const [context,setContext]=useState(initialContext);
 const [insight,setInsight]=useState(initialInsight);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');

 useEffect(()=>{
  let active=true;
  const refresh=async()=>{try{const response=await fetch(`/api/insights?language=${language}`,{cache:'no-store'});const data=await response.json();if(active&&response.ok){setContext(data.context);setInsight(data.insight);}}catch{/* Keep the last visibly dated snapshot; generation rechecks facts. */}};
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
  }catch(e){setError(e instanceof Error&&e.name!=='TimeoutError'?e.message:'The generation response was interrupted. Source facts remain available; refresh to check for a saved summary.');}
  finally{setBusy(false);}
 }

 const f=context.facts;
 const current=insight?.language===language?insight:null;
 const actions=buildInsightActions(f,language);
 const health=stockHealthPercent(f);
 const bn=language==='bn';

 return <>
  <Heading eyebrow="Insights / AI" title="AI decision center" description="Verified business facts, a grounded AI readout, and clear next actions—without giving AI permission to change your store." actions={<div className="insight-actions"><select aria-label="Insight language" disabled={busy} value={language} onChange={e=>{setLanguage(e.target.value as Language);setError('');}}><option value="bn">বাংলা</option><option value="en">English</option></select><button className="button primary" type="button" disabled={busy} onClick={()=>void generate(!!current)}>{current?<RefreshCw size={15}/>:<Sparkles size={15}/>} {busy?'Generating…':current?'Refresh analysis':'Generate analysis'}</button></div>}/>

  <section className="insight-command" aria-labelledby="decision-center-title">
   <div className="insight-command-copy">
    <span className="insight-kicker"><Sparkles size={14}/> {bn?'আজকের business pulse':'Today’s business pulse'}</span>
    <h2 id="decision-center-title">{f.inventory.attention_count>0?(bn?'প্রথমে stock availability ঠিক করুন':'Start with stock availability'):(bn?'Stock অবস্থান স্থিতিশীল':'Stock position is stable')}</h2>
    <p>{f.inventory.attention_count>0?(bn?`${localNumber(f.inventory.attention_count,language)}টি পণ্য review দরকার। নিচের action থেকে replenishment শুরু করুন, তারপর sales ও purchase activity দেখুন।`:`${localNumber(f.inventory.attention_count,language)} products need review. Start replenishment below, then check today’s sales and receiving activity.`):(bn?'বর্তমান minimum অনুযায়ী কোনো stock alert নেই। Sales ও inventory mix review করুন।':'No stock alerts are active against recorded minimums. Review sales performance and inventory mix next.')}</p>
    <div className="insight-command-actions">{f.inventory.attention_count>0&&<Link className="button primary" href={actions[0].href}><PackagePlus size={15}/>{bn?'Replenishment শুরু করুন':'Start replenishment'}</Link>}<Link className="button" href="/reports/inventory"><BarChart3 size={15}/>{bn?'Inventory report':'Inventory report'}</Link></div>
   </div>
   <div className="insight-health">
    <div className="insight-health-ring" style={{'--health':`${health}%`} as CSSProperties}><strong>{health}%</strong><span>{bn?'minimum পূরণ':'at / above minimum'}</span></div>
    <div className="insight-health-meta"><span>Fact snapshot</span><strong>{displayDate(f.snapshot_at,true)}</strong><small>Asia/Dhaka · Revision {f.data_revision}</small></div>
   </div>
  </section>

  <div className="insight-metrics" aria-label="Business snapshot">
   <div><span>{bn?'আজকের net sales':'Net sales today'}</span><strong>{money(f.sales.total_paisa)}</strong><small>{localNumber(f.sales.count,language)} {bn?'completed sale':'completed sales'}</small></div>
   <div><span>{bn?'Stock estimate':'Stock estimate'}</span><strong>{money(f.inventory.value_paisa)}</strong><small>{localNumber(f.inventory.active_count,language)} {bn?'active product':'active products'}</small></div>
   <div className={f.inventory.attention_count>0?'attention':''}><span>{bn?'Review দরকার':'Products to review'}</span><strong>{localNumber(f.inventory.attention_count,language)}</strong><small>{localNumber(f.inventory.out_of_stock,language)} out · {localNumber(f.inventory.low_stock,language)} low</small></div>
   <div><span>{bn?'আজ received':'Received today'}</span><strong>{money(f.purchases.total_paisa)}</strong><small>{localNumber(f.purchases.count,language)} {bn?'received purchase':'received purchases'}</small></div>
  </div>

  <section className="insight-actions-section" aria-labelledby="next-actions-title">
   <div className="insight-section-heading"><div><span className="eyebrow">Decision support</span><h2 id="next-actions-title">{bn?'পরবর্তী কাজগুলো':'Recommended next moves'}</h2></div><p>{bn?'সব action verified facts থেকে তৈরি; AI কোনো write execute করে না।':'Every action is derived from verified facts; AI never executes a write.'}</p></div>
   <div className="insight-action-grid">{actions.map(action=>{const Icon=actionIcons[action.kind];return <article className={`insight-action-card ${action.tone}`} key={action.id}><div className="insight-action-top"><span className="insight-action-icon"><Icon size={18}/></span><span className="badge">{action.label}</span><strong>{action.metric}</strong></div><h3>{action.title}</h3><p>{action.description}</p><div className="insight-action-links"><Link className="button primary" href={action.href}>{action.cta}<ArrowRight size={13}/></Link>{action.secondaryHref&&<Link className="insight-text-link" href={action.secondaryHref}>{action.secondaryCta}</Link>}</div></article>;})}</div>
  </section>

  <div className="insight-workspace">
   <Card title={bn?'AI executive readout':'AI executive readout'} description={bn?'Verified facts-এর ওপর grounded explanation।':'Grounded explanation of the verified snapshot.'} className="insight-panel" body>
    {error&&<div className="form-message"><Notice tone="error">{error}</Notice></div>}
    {current?<div className="insight-readout">{current.stale&&<div className="form-message"><Notice tone="warning">This analysis is stale. Store data or the Dhaka business date changed. Refresh it before using it.</Notice></div>}<div className="insight-readout-meta"><span className="insight-provider"><Sparkles size={12}/>{current.provider==='test'?'Test adapter':current.provider}<b>·</b>{current.model}</span><span>{displayDate(current.generated_at,true)}</span></div><div lang={language} className="insight-summary"><p>{current.output.summary}</p></div><div className="insight-readout-sections">{current.output.sections.map((section,index)=><section key={index} className="insight-section" lang={language}><div className="row"><span className="swatch"><Sparkles size={17}/></span><h3>{section.heading}</h3></div><p>{section.explanation}</p><small className="muted">Supporting facts: {section.fact_ids.join(', ')}</small></section>)}</div><div className="insight-audit"><ShieldCheck size={14}/><span>Fact snapshot {displayDate(current.facts_snapshot.snapshot_at,true)} · Revision {current.store_data_revision} · {current.prompt_version}</span></div></div>:<Empty title={busy?(bn?'Analysis প্রস্তুত হচ্ছে…':'Preparing analysis…'):(bn?'Verified facts প্রস্তুত':'Verified facts are ready')} description={bn?'AI readout optional। Action cards source facts থেকে সবসময় available থাকে।':'The AI readout is optional. Action cards remain available from source facts even without a provider.'}/>} 
    <div style={{marginTop:24}}><Notice><ShieldCheck size={15}/>Generating sends necessary business facts and bounded product/category names to the configured external AI provider. Emails, phone numbers, passwords and full receipts are not sent.</Notice></div>
   </Card>

   <div className="stack">
    <Card title={bn?'Verified source facts':'Verified source facts'} description={`Snapshot: ${displayDate(f.snapshot_at,true)} · Asia/Dhaka`} body><dl className="facts compact"><dt>Active products</dt><dd>{f.inventory.active_count}</dd><dt>In stock</dt><dd>{f.inventory.in_stock}</dd><dt>Low stock</dt><dd>{f.inventory.low_stock}</dd><dt>Out of stock</dt><dd>{f.inventory.out_of_stock}</dd><dt>Products to review</dt><dd>{f.inventory.attention_count}</dd><dt>Reference-cost estimate</dt><dd>{money(f.inventory.value_paisa)}</dd><dt>Today’s net sales</dt><dd>{money(f.sales.total_paisa)}</dd><dt>Received value today</dt><dd>{money(f.purchases.total_paisa)}</dd></dl><Notice tone="neutral">Totals cover the whole active catalog and all matching posted records—not just the examples shown.</Notice></Card>

    <Card title={bn?'Replenishment queue':'Replenishment queue'} description={f.attention.length?`${f.attention.length} priority examples from the verified snapshot`:'No current alerts'} body>{f.attention.length?<div className="insight-stock-list">{f.attention.slice(0,6).map(p=><div key={p.id} className="insight-stock-row"><div><strong>{p.name}</strong><small>{p.quantity} available · min {p.minimum_stock}</small></div><div><Status status={p.quantity===0?'out_of_stock':'low_stock'}/><span>{p.shortage} {p.unit}</span></div></div>)}{f.attention_truncated&&<p className="muted small">Showing priority examples of {f.inventory.attention_count} products.</p>}<Link className="button full" href="/inventory/low-stock"><ClipboardList size={14}/>{bn?'সব stock alert দেখুন':'Review all stock alerts'}</Link></div>:<div className="insight-stock-empty"><Boxes size={22}/><p>{bn?'কোনো active stock alert নেই।':'No active stock alerts.'}</p><Link href="/inventory">View inventory</Link></div>}</Card>
   </div>
  </div>
 </>;
}
