import { revalidatePath } from 'next/cache';
import { mutationSchema, productSchema, categorySchema, supplierSchema, storeSchema, identitySchema, purchaseSchema, saleSchema } from '@/lib/schemas';
import { rpc } from '@/lib/server/data';
import { json, failure, readBody } from '@/lib/server/http';
import { AppError } from '@/lib/errors';
import type { Json } from '@/lib/database.types';
export const dynamic='force-dynamic';
export async function POST(request:Request) {
 const requestId=crypto.randomUUID();const started=Date.now();
 try {
  const input=mutationSchema.parse(await readBody(request));let result:unknown;
  if(input.operation==='catalog') {
   if(!input.kind || !input.action) throw new AppError('VALIDATION_ERROR');
   const schema=input.action==='save'?{product:productSchema,category:categorySchema,supplier:supplierSchema,store:storeSchema}[input.kind]:identitySchema;
   const payload=schema.parse(input.payload);
   result=await rpc('catalog_mutate',{p_kind:input.kind,p_action:input.action,p_payload:payload as Json,p_request_id:input.request_id});
  } else if(input.operation==='save_purchase_draft'||input.operation==='receive_purchase') {
   result=await rpc('write_purchase',{p_payload:purchaseSchema.parse(input.payload) as Json,p_request_id:input.request_id,p_receive:input.operation==='receive_purchase'});
  } else if(input.operation==='delete_purchase_draft') {
   const payload=identitySchema.parse(input.payload);result=await rpc('delete_purchase_draft',{p_id:payload.id,p_expected_version:payload.expected_version,p_request_id:input.request_id});
  } else result=await rpc('complete_sale',{p_payload:saleSchema.parse(input.payload) as Json,p_request_id:input.request_id});
  revalidatePath('/','layout');
  console.info(JSON.stringify({event:'operation_committed',operation:input.operation,request_id:input.request_id,duration_ms:Date.now()-started}));
  return json({result});
 } catch(e){return failure(e,requestId);}
}
