import { z } from 'zod';
import { rpc } from '@/lib/server/data';
import { json, failure } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try{const params=new URL(request.url).searchParams;const operation=z.string().regex(/^(complete_sale|receive_purchase|save_purchase_draft|delete_purchase_draft|catalog:(product|category|supplier|store):(save|delete|archive|restore))$/).parse(params.get('operation'));const id=z.string().uuid().parse(params.get('id'));return json(await rpc('get_operation_result',{p_operation:operation,p_request_id:id}));}catch(e){return failure(e);}
}
