import {PointOfSale} from '@/features/pos';
import {catalog} from '@/lib/server/data';
import type {Product} from '@/lib/domain';
export default async function Page(){return <PointOfSale initial={await catalog<Product>('products',{size:20})}/>}
