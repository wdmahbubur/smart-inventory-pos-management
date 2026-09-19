import {z} from 'zod';
import {PurchaseEditor} from '@/features/purchase-editor';
import {entity} from '@/lib/server/data';
import type {Product} from '@/lib/domain';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const params=await searchParams;const ids=params.products?z.array(z.string().uuid()).max(100).parse([...new Set(params.products.split(','))]):[];const products=await Promise.all(ids.map(id=>entity<Product>('products',id)));return <PurchaseEditor prefilled={products.filter(p=>!p.archived_at)}/>}
