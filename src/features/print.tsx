'use client';
import {useState} from 'react';
import {Printer} from 'lucide-react';
export function PrintButton({receipt=false}:{receipt?:boolean}){const [format,setFormat]=useState('a4');function print(){document.querySelector('.receipt')?.classList.toggle('thermal',format==='thermal');window.print();}return <div className="print-options no-print">{receipt&&<select aria-label="Receipt print format" value={format} onChange={e=>setFormat(e.target.value)}><option value="a4">A4 document</option><option value="thermal">80 mm receipt</option></select>}<button className="button" type="button" onClick={print}><Printer size={15}/>Print {receipt?'receipt':'purchase'}</button></div>}
