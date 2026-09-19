import {redirect} from 'next/navigation';
import {PurchaseEditor} from '@/features/purchase-editor';
import {entity} from '@/lib/server/data';
import type {Purchase} from '@/lib/domain';
export default async function Page({params}:{params:Promise<{id:string}>}){const draft=await entity<Purchase>('purchases',(await params).id);if(draft.status==='received')redirect(`/purchases/${draft.id}`);return <PurchaseEditor key={`${draft.id}:${draft.version}`} draft={draft}/>}
