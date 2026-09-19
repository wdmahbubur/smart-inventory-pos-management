import {ProductsPage,type SearchParams} from '@/features/catalog-pages';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){return <ProductsPage params={await searchParams}/>}
