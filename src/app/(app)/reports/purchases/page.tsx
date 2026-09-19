import {ReportPage} from '@/features/report-pages';
import type {SearchParams} from '@/features/catalog-pages';
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){return <ReportPage kind="purchases" params={await searchParams}/>}
