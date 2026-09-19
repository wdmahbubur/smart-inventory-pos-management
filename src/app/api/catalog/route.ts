import { z } from 'zod';
import { catalog, rpc } from '@/lib/server/data';
import { parseFilters } from '@/lib/schemas';
import { json, failure } from '@/lib/server/http';
export const dynamic='force-dynamic';
export async function GET(request:Request) {
 try {const url=new URL(request.url);const kind=z.enum(['products','categories','suppliers']).parse(url.searchParams.get('kind'));const id=url.searchParams.get('id');
  if(id)return json({result:await rpc('get_entity',{p_kind:kind,p_id:z.string().uuid().parse(id)})});
  return json(await catalog(kind,parseFilters(Object.fromEntries(url.searchParams))));
 }catch(e){return failure(e);}
}
