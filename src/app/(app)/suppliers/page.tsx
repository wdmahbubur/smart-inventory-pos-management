import {SuppliersPage,type SearchParams} from '@/features/catalog-pages';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){return <SuppliersPage params={await searchParams}/>}
