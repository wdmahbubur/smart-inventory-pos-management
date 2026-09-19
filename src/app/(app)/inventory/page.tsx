import Link from 'next/link';
import {Plus,History} from 'lucide-react';
import {Heading,Card,Table,ProductLabel,Status,Pagination,Empty,Notice} from '@/components/ui';
import {FiltersBar} from '@/components/filters';
import {CatalogFilter} from '@/features/catalog-filter';
import {catalog,entity,pageWorkspace} from '@/lib/server/data';
import {parseFilters} from '@/lib/schemas';
import {money} from '@/lib/money';
import type {SearchParams} from '@/features/catalog-pages';
import type {Product,Category} from '@/lib/domain';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){
 const params=await searchParams,filters=parseFilters(params);filters.archived=false;
 const [data,w,category]=await Promise.all([catalog<Product>('products',filters),pageWorkspace(),filters.category?entity<Category>('categories',filters.category):Promise.resolve(null)]);
 return <><Heading eyebrow="Stock on hand" title="Current inventory" description="A read-only view of quantities available in your store." actions={<><Link href="/inventory/movements" className="button"><History size={15}/>Stock history</Link><Link href="/purchases/new" className="button primary"><Plus size={15}/>Record purchase</Link></>}/><FiltersBar stock><CatalogFilter initial={category}/></FiltersBar><Card title="Stock on hand" action={<span className="badge">Total value: {money(w.inventory.value_paisa)}</span>}><Table headers={['Product','Available','Minimum','Ref. unit cost','Stock value','Status']} empty={!data.rows.length?<Empty title="No inventory matches" description="Add products and receive a purchase, or change the current filters." href="/products/new" action="Add product"/>:undefined}>{data.rows.map(p=><tr key={p.id}><td><ProductLabel name={p.name} sku={p.sku} icon_key={p.icon_key} color_key={p.color_key}/></td><td><strong>{p.quantity}</strong> {p.unit}</td><td>{p.minimum_stock}</td><td>{money(p.reference_cost_paisa)}</td><td><strong>{money(p.stock_value_paisa)}</strong></td><td><Status status={p.stock_status}/></td></tr>)}</Table><div className="card-footer between"><span className="muted small">Filtered estimate · all {data.total} matching products</span><strong>{money(data.filtered_value_paisa??'0')}</strong></div><Pagination data={data} path="/inventory" params={params}/></Card><div style={{marginTop:18}}><Notice>Stock value = available quantity × reference purchase cost. This is an operational estimate, not an accounting valuation. Quantities cannot be edited here.</Notice></div></>;
}
