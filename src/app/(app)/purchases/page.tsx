import Link from 'next/link';
import {Plus,ArrowRight} from 'lucide-react';
import {Heading,Card,Table,Status,Pagination,Empty,queryLink,Notice} from '@/components/ui';
import {FiltersBar} from '@/components/filters';
import {CatalogFilter} from '@/features/catalog-filter';
import {DeleteDraft} from '@/features/draft-actions';
import {documents,entity} from '@/lib/server/data';
import {parseFilters} from '@/lib/schemas';
import {money} from '@/lib/money';
import {displayDate} from '@/lib/dates';
import type {SearchParams} from '@/features/catalog-pages';
import type {Purchase,Supplier} from '@/lib/domain';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){
 const params=await searchParams,filters=parseFilters(params);
 const [data,supplier]=await Promise.all([documents<Purchase>('purchases',filters),filters.supplier?entity<Supplier>('suppliers',filters.supplier):Promise.resolve(null)]);
 const received=data.received_count??0,drafts=data.draft_count??0;
 const tabs=[{key:'',label:'All purchases',count:received+drafts},{key:'received',label:'Received',count:received},{key:'draft',label:'Drafts',count:drafts}];
 return <><Heading eyebrow="Stock in" title="Purchases" description="Record stock received from suppliers and review purchase history." actions={<Link className="button primary" href="/purchases/new"><Plus size={15}/>New purchase</Link>}/><nav className="tabs" aria-label="Purchase status">{tabs.map(tab=><Link key={tab.key} href={queryLink('/purchases',params,{status:tab.key,page:undefined})} className={(filters.status??'')===tab.key?'active':''}>{tab.label} <small>({tab.count})</small></Link>)}</nav><FiltersBar dates><CatalogFilter kind="suppliers" initial={supplier}/></FiltersBar><Card title="Purchase records" action={<span className="badge">Received total: {money(data.total_paisa??'0')}</span>}><Table headers={['Purchase','Date','Supplier','Items','Total','Status','Action']} empty={!data.rows.length?<Empty title="No purchases found" description="Record goods received or save a draft for later." href="/purchases/new" action="New purchase"/>:undefined}>{data.rows.map(p=><tr key={p.id}><td><strong>{p.number}</strong></td><td>{displayDate(p.activity_at)}<small className="muted" style={{display:'block'}}>Invoice: {displayDate(p.purchase_date)}</small></td><td>{p.supplier_name}</td><td>{p.product_count} products</td><td><strong>{money(p.total_paisa)}</strong></td><td><Status status={p.status}/></td><td><div className="row"><Link className="table-action" href={`/purchases/${p.id}${p.status==='draft'?'/edit':''}`}>{p.status==='draft'?'Continue':'View'}<ArrowRight size={12}/></Link>{p.status==='draft'&&<DeleteDraft id={p.id} version={p.version} number={p.number}/>}</div></td></tr>)}</Table><Pagination data={data} path="/purchases" params={params}/></Card><div style={{marginTop:18}}><Notice>Only received purchases increase stock. A draft does not change quantities or received purchase totals. Date filtering uses received time for posted purchases and last-saved time for drafts.</Notice></div></>;
}
