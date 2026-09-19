'use client';
import Link from 'next/link';
import {useState} from 'react';
import {useRouter} from 'next/navigation';
import {Pencil} from 'lucide-react';
import {Dialog} from '@/components/dialog';
import {OperationFeedback} from '@/components/operation-feedback';
import {useOperation} from '@/lib/client/use-operation';
import {useWorkspace} from '@/components/workspace-context';
import {CatalogEditor} from './catalog-editor';
import type {Category,Supplier,Product} from '@/lib/domain';
export function CatalogActions({kind,record}:{kind:'product'|'category'|'supplier';record:Product|Category|Supplier}){
 const w=useWorkspace(),router=useRouter();const [open,setOpen]=useState(false);const operation=useOperation(`${w.store.id}:${kind}:action:${record.id}`);
 function success(){setOpen(false);router.refresh();}
 async function change(action:string){if(!action)return;const confirmed=confirm(`${action==='delete'?'Permanently delete':action==='archive'?'Archive':'Restore'} ${record.name}? Referenced records and remaining stock are protected by the database.`);if(!confirmed)return;setOpen(true);const result=await operation.submit({operation:'catalog',kind,action:action as 'archive'|'restore'|'delete',payload:{id:record.id,expected_version:record.version}});if(result)success();}
 const archived='archived_at'in record&&!!record.archived_at;
 return <div className="row">{kind==='product'?<Link className="icon-button" href={`/products/${record.id}/edit`} aria-label={`Edit ${record.name}`}><Pencil size={16}/></Link>:<CatalogEditor kind={kind} record={record as Category|Supplier}/>}<select className="select-actions" aria-label={`Actions for ${record.name}`} value="" disabled={operation.locked} onChange={e=>void change(e.target.value)}><option value="">Actions</option>{kind!=='category'&&<option value={archived?'restore':'archive'}>{archived?'Restore':'Archive'}</option>}<option value="delete">Delete unused</option></select><Dialog open={open||!!operation.pending} onClose={()=>{if(!operation.locked)setOpen(false);}} title="Record action"><OperationFeedback operation={operation} onSuccess={success}/>{operation.busy&&<p className="muted">Saving the requested change…</p>}</Dialog></div>;
}
