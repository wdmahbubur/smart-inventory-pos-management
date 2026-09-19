import Link from 'next/link';
import {Heading,Stat,Pagination} from '@/components/ui';
import {FiltersBar} from '@/components/filters';
import {LowStockTable} from '@/features/low-stock';
import {CatalogFilter} from '@/features/catalog-filter';
import {rpc,entity} from '@/lib/server/data';
import {parseFilters} from '@/lib/schemas';
import type {Json} from '@/lib/database.types';
import type {SearchParams} from '@/features/catalog-pages';
import type {Product,PageResult,Category} from '@/lib/domain';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){const params=await searchParams,parsed=parseFilters(params);const filters={...(parsed.q?{q:parsed.q}:{}),...(parsed.page?{page:parsed.page}:{}),...(parsed.size?{size:parsed.size}:{}),...(parsed.category?{category:parsed.category}:{})};const [data,category]=await Promise.all([rpc<PageResult<Product>&{out_of_stock:number;low_stock:number;attention_count:number}>('get_low_stock',{p_filters:filters as Json}),filters.category?entity<Category>('categories',filters.category):Promise.resolve(null)]);return <><Heading eyebrow="Stock control / Attention" title="Low stock" description="Review zero-stock and below-minimum products before replenishing." actions={<Link className="button" href="/inventory">View inventory</Link>}/><div className="stats three"><Stat label="Products to review" value={data.attention_count} note="All active products · ignores table filters" color="amber"/><Stat label="Out of stock" value={data.out_of_stock} note="Available quantity is zero" color="rose"/><Stat label="Below minimum" value={data.low_stock} note="Positive quantity below its minimum" color="amber"/></div><FiltersBar><CatalogFilter initial={category}/></FiltersBar><LowStockTable rows={data.rows}/><Pagination data={data} path="/inventory/low-stock" params={params}/></>}
