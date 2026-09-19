'use client';
import { useEffect, useRef, useState } from 'react';
import type { MutationInput } from '@/lib/schemas';
import { mutationSchema } from '@/lib/schemas';
import type { OperationResult } from '@/lib/domain';
export interface ClientError {code:string;message:string;uncertain:boolean;fields?:Record<string,string[]>;details?:Record<string,unknown>}
function operationName(input:MutationInput){return input.operation==='catalog'?`catalog:${input.kind}:${input.action}`:input.operation;}
export function useOperation(scope:string){
 const key=`si:operation:${scope}`;const inFlight=useRef(false);const pendingRef=useRef<MutationInput|null>(null);
 const [busy,setBusy]=useState(false);const [pending,setPending]=useState<MutationInput|null>(null);const [error,setError]=useState<ClientError|null>(null);
 useEffect(()=>{try{const saved=sessionStorage.getItem(key);if(saved){const value=mutationSchema.parse(JSON.parse(saved));pendingRef.current=value;setPending(value);setError({code:'TEMPORARY_FAILURE',message:'An earlier submission has an unresolved outcome. Check its status or retry the same request before editing.',uncertain:true});}}catch{sessionStorage.removeItem(key);}},[key]);
 function forget(){pendingRef.current=null;setPending(null);try{sessionStorage.removeItem(key);}catch{/* Private browsing may restrict storage. */}}
 function remember(input:MutationInput){pendingRef.current=input;setPending(input);try{sessionStorage.setItem(key,JSON.stringify(input));}catch{/* The in-memory key still prevents duplicate retries in this tab. */}}
 async function send(input:MutationInput):Promise<OperationResult|null>{
  if(inFlight.current)return null;inFlight.current=true;setBusy(true);setError(null);remember(input);
  try{const response=await fetch('/api/mutate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(45000)});const value=await response.json();
   if(value.error){setError(value.error);if(!value.error.uncertain)forget();return null;}
   if(!response.ok||!value.result)throw new Error('Unknown response');
   forget();window.dispatchEvent(new Event('si:data-changed'));return value.result as OperationResult;
  }catch{setError({code:'TEMPORARY_FAILURE',message:'The response was interrupted. The operation may have committed. Retry this same request or check its status; do not create a replacement.',uncertain:true});return null;}
  finally{inFlight.current=false;setBusy(false);}
 }
 async function submit(input:Omit<MutationInput,'request_id'>){if(pendingRef.current)return send(pendingRef.current);return send({...input,request_id:crypto.randomUUID()});}
 async function retry(){return pendingRef.current?send(pendingRef.current):null;}
 async function recover():Promise<OperationResult|null>{
  const input=pendingRef.current;if(!input||inFlight.current)return null;setBusy(true);inFlight.current=true;
  try{const response=await fetch(`/api/operations?operation=${encodeURIComponent(operationName(input))}&id=${input.request_id}`,{cache:'no-store'});const value=await response.json();if(value.committed&&value.result){forget();setError(null);window.dispatchEvent(new Event('si:data-changed'));return value.result;}setError(value.error??{code:'TEMPORARY_FAILURE',message:'No committed result was found yet. Retry the saved request with the same key to safely resolve it.',uncertain:true});return null;}
  catch{setError({code:'TEMPORARY_FAILURE',message:'Status could not be checked. The saved request key is still preserved.',uncertain:true});return null;}
  finally{inFlight.current=false;setBusy(false);}
 }
 return {submit,retry,recover,busy,pending,error,setError,locked:busy||!!pending};
}
