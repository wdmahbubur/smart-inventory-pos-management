import {CategoriesPage,type SearchParams} from '@/features/catalog-pages';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){return <CategoriesPage params={await searchParams}/>}
