import {z} from 'zod';
import {report} from '@/lib/server/data';
import {parseFilters} from '@/lib/schemas';
import {serializeCsv,reportColumns} from '@/lib/csv';
import {failure,privateHeaders} from '@/lib/server/http';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request,{params}:{params:Promise<{kind:string}>}){
 const started=Date.now(),requestId=crypto.randomUUID();
 try{const kind=z.enum(['sales','purchases','inventory']).parse((await params).kind);const filters=parseFilters(Object.fromEntries(new URL(request.url).searchParams));const data=await report(kind,filters,true);const csv=serializeCsv([{key:'snapshot_at',label:'Generated snapshot (UTC)'},...reportColumns[kind]],data.source_rows.map(row=>({...row,snapshot_at:data.snapshot_at})));
 const generated=data.snapshot_at.replace(/[^0-9TZ]/g,'');const period=data.from?`${data.from}_to_${data.to}`:'current';
 console.info(JSON.stringify({event:'report_exported',kind,rows:data.source_count,request_id:requestId,duration_ms:Date.now()-started}));
 return new Response(csv,{headers:{...privateHeaders,'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${kind}_${period}_${generated}.csv"`,'X-Content-Type-Options':'nosniff'}});
 }catch(error){return failure(error,requestId);}
}
