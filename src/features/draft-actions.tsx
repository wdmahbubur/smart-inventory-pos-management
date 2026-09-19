'use client';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Trash2} from 'lucide-react';
import {Dialog} from '@/components/dialog';
import {OperationFeedback} from '@/components/operation-feedback';
import {useOperation} from '@/lib/client/use-operation';
import {useWorkspace} from '@/components/workspace-context';
export function DeleteDraft({id,version,number}:{id:string;version:number;number:string}){const w=useWorkspace(),router=useRouter();const operation=useOperation(`${w.store.id}:delete-draft:${id}`);const [open,setOpen]=useState(false);function success(){setOpen(false);router.refresh();}async function remove(){if(!confirm(`Delete draft ${number}? It has no stock effect. Its number will not be reused.`))return;setOpen(true);const result=await operation.submit({operation:'delete_purchase_draft',payload:{id,expected_version:version}});if(result)success();}return <><button type="button" className="icon-button" aria-label={`Delete draft ${number}`} disabled={operation.locked} onClick={()=>void remove()}><Trash2 size={15}/></button><Dialog open={open||!!operation.pending} onClose={()=>{if(!operation.locked)setOpen(false);}} title="Delete purchase draft"><OperationFeedback operation={operation} onSuccess={success}/>{operation.busy&&<p className="muted">Deleting the draft…</p>}</Dialog></>}
