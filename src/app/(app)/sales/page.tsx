import Link from 'next/link';
import {Plus,ArrowRight} from 'lucide-react';
import {Heading,Stat,Card,Table,Status,Pagination,Empty,Notice} from '@/components/ui';
import {FiltersBar} from '@/components/filters';
import {documents} from '@/lib/server/data';
import {parseFilters} from '@/lib/schemas';
import {money} from '@/lib/money';
import {displayDate} from '@/lib/dates';
import type {SearchParams} from '@/features/catalog-pages';
import type {Sale} from '@/lib/domain';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){const params=await searchParams,data=await documents<Sale>('sales',parseFilters(params));return <><Heading eyebrow="Operations / Sales" title="Sales" description="Review completed cash sales and open their saved receipts." actions={<Link href="/pos" className="button primary"><Plus size={15}/>New sale</Link>}/><div className="stats three"><Stat label="Net sales" value={money(data.total_paisa??'0')} note="Matching records · after order discounts" icon="store"/><Stat label="Completed sales" value={data.total} note="Cash sales posted to inventory" color="blue"/><Stat label="Units sold" value={data.units??0} note="Selling units across matching records" color="amber"/></div><FiltersBar dates/><Card><Table headers={['Receipt','Completed at','Customer','Units','Total','Payment','Status','Action']} empty={!data.rows.length?<Empty title="No completed sales found" description="Complete a cash sale or change the search and date filters." href="/pos" action="Open point of sale"/>:undefined}>{data.rows.map(s=><tr key={s.id}><td><strong>{s.number}</strong></td><td>{displayDate(s.completed_at,true)}</td><td>{s.customer_name||'Walk-in customer'}</td><td>{s.units}</td><td><strong>{money(s.total_paisa)}</strong></td><td>Cash</td><td><Status status="completed"/></td><td><Link href={`/sales/${s.id}`} className="table-action">Receipt<ArrowRight size={12}/></Link></td></tr>)}</Table><Pagination data={data} path="/sales" params={params}/></Card><div style={{marginTop:18}}><Notice>Net sales exclude order discounts. Cash tender and change are not revenue. Completed sales remain read-only.</Notice></div></>}
