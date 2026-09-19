'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
export function Dialog({open,onClose,title,children,className=''}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null);const titleId=useId();
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const trigger=document.activeElement as HTMLElement|null;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();return()=>{if(dialog.open)dialog.close();if(open)trigger?.focus();};},[open]);
 return <dialog ref={ref} className={className} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={20}/></button></div><div className="dialog-body">{children}</div></dialog>;
}
