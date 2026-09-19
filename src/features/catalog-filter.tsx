'use client';
import {usePathname,useRouter,useSearchParams} from 'next/navigation';
import {Picker} from '@/components/picker';
export function CatalogFilter({kind='categories',initial}:{kind?:'categories'|'suppliers'|'products';initial?:{id:string;name:string}|null}){
 const path=usePathname(),router=useRouter(),params=useSearchParams();const field=kind==='categories'?'category':kind==='suppliers'?'supplier':'product';
 function change(value:string){const next=new URLSearchParams(params);next.delete('page');if(value)next.set(field,value);else next.delete(field);router.replace(path+(next.size?'?'+next.toString():''),{scroll:false});}
 return <div className="row"><Picker kind={kind} value={initial} label={`All ${kind}`} onSelect={item=>change(item.id)}/>{initial&&<button className="icon-button" type="button" onClick={()=>change('')} aria-label={`Clear ${field} filter`}>×</button>}</div>;
}
