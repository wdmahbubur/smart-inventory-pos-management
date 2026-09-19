import {ProductForm} from '@/features/product-form';
import {entity} from '@/lib/server/data';
import type {Product} from '@/lib/domain';
export default async function Page({params}:{params:Promise<{id:string}>}){return <ProductForm product={await entity<Product>('products',(await params).id)}/>}
