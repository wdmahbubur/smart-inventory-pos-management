'use client';
import Link from 'next/link';
import { Notice } from './ui';
import type { useOperation } from '@/lib/client/use-operation';
import type { OperationResult } from '@/lib/domain';
export function OperationFeedback({operation,onSuccess}:{operation:ReturnType<typeof useOperation>;onSuccess:(value:OperationResult)=>void}){
 const {error,busy,pending}=operation;if(!error)return null;
 async function retry(){const result=await operation.retry();if(result)onSuccess(result);}
 async function recover(){const result=await operation.recover();if(result)onSuccess(result);}
 return <div className="form-message" tabIndex={-1}><Notice tone="error"><p>{error.message}</p>{error.fields&&Object.entries(error.fields).map(([name,items])=><p key={name}>{name.replaceAll('_',' ')}: {items.join(' ')}</p>)}{error.code==='UNAUTHENTICATED'&&<Link href="/login">Log in again</Link>}{error.uncertain&&pending&&<div className="button-row" style={{marginTop:12}}><button type="button" className="button" disabled={busy} onClick={recover}>Check operation status</button><button type="button" className="button primary" disabled={busy} onClick={retry}>Retry same request</button></div>}{error.code==='VERSION_CONFLICT'&&<button type="button" className="text-link" onClick={()=>{if(confirm('Reload the current record? Unsaved edits on this page will be discarded.'))location.reload();}}>Reload current version</button>}</Notice></div>;
}
