'use client';
import Link from 'next/link';
import {useState} from 'react';
import {Plus,ShoppingBag} from 'lucide-react';
import {Card,Table,ProductLabel,Status,Empty,Notice} from '@/components/ui';
import type {Product} from '@/lib/domain';
import {shortage} from '@/lib/money';
export function LowStockTable({rows}:{rows:Product[]}){
 const [selected,setSelected]=useState<string[]>([]);
 function toggle(id:string){setSelected(ids=>ids.includes(id)?ids.filter(value=>value!==id):ids.length<100?[...ids,id]:ids);}
 const allSelected=rows.length>0&&rows.every(row=>selected.includes(row.id));
 return <><div className="between" style={{marginBottom:15}}><label className="selection-box muted small"><input type="checkbox" checked={allSelected} disabled={!rows.length} onChange={()=>setSelected(ids=>allSelected?ids.filter(id=>!rows.some(row=>row.id===id)):[...new Set([...ids,...rows.map(row=>row.id)])].slice(0,100))}/>Select this page · {selected.length} selected</label>{selected.length>0?<Link className="button primary" href={`/purchases/new?products=${selected.join(',')}`}><ShoppingBag size={15}/>Create purchase</Link>:<span className="muted small">Select up to 100 products</span>}</div><Card><Table headers={['','Product','Status','Available','Minimum','Suggested units','Action']} empty={!rows.length?<Empty title="No stock alerts match" description="Your active products are either above minimum or excluded by the current filters." href="/inventory" action="View inventory"/>:undefined}>{rows.map(p=><tr key={p.id}><td><input type="checkbox" aria-label={`Select ${p.name}`} checked={selected.includes(p.id)} onChange={()=>toggle(p.id)}/></td><td><ProductLabel name={p.name} sku={p.sku} icon_key={p.icon_key} color_key={p.color_key}/></td><td><Status status={p.stock_status}/></td><td>{p.quantity} {p.unit}</td><td>{p.minimum_stock}</td><td><strong>{shortage(p.quantity,p.minimum_stock)}</strong>{p.minimum_stock===0&&<small style={{display:'block'}} className="muted">Choose quantity in purchase</small>}</td><td><Link href={`/purchases/new?products=${p.id}`} className="table-action"><Plus size={13}/>Add to purchase</Link></td></tr>)}</Table></Card><div style={{marginTop:18}}><Notice tone="warning">Suggested quantity is minimum stock minus available stock, never a demand forecast. Prefilling does not save or receive a purchase. Select a supplier and review quantities and costs.</Notice></div></>;
}
