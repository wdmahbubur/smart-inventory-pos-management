import 'server-only';
import { cache } from 'react';
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppError, fromDatabase } from '@/lib/errors';
import type { Database, Json } from '@/lib/database.types';
import type { Workspace, Filters, CatalogKind, DocumentKind, ReportKind, PageResult, Report } from '@/lib/domain';
export const requireOwner = cache(async () => {
 const client=await createClient(); const {data,error}=await client.auth.getUser();
 if (error || !data.user) throw new AppError('UNAUTHENTICATED');
 return {client,user:data.user};
});
export async function rpc<T>(name:keyof Database['public']['Functions'], args:Record<string,Json|undefined> = {}):Promise<T> {
 const {client}=await requireOwner();
 const {data,error}=await client.rpc(name,args as never);
 if (error) throw fromDatabase(error);
 return data as unknown as T;
}
export const workspace=cache(async()=>rpc<Workspace>('get_workspace'));
export async function pageWorkspace() { try { return await workspace(); } catch(e) { if(e instanceof AppError && e.code==='UNAUTHENTICATED') redirect('/login'); throw e; } }
export const catalog=<T>(kind:CatalogKind,filters:Filters={})=>rpc<PageResult<T>>('list_catalog',{p_kind:kind,p_filters:filters as Json});
export const documents=<T>(kind:DocumentKind,filters:Filters={})=>rpc<PageResult<T>>('list_documents',{p_kind:kind,p_filters:filters as Json});
export const report=(kind:ReportKind,filters:Filters={},exportRows=false)=>rpc<Report>('get_report',{p_kind:kind,p_filters:filters as Json,p_export:exportRows});
export async function entity<T>(kind:CatalogKind|'purchases'|'sales',id:string):Promise<T> {
 if(!/^[0-9a-f-]{36}$/i.test(id)) notFound();
 try {return await rpc<T>('get_entity',{p_kind:kind,p_id:id});} catch(e){if(e instanceof AppError && e.code==='NOT_FOUND')notFound();throw e;}
}
