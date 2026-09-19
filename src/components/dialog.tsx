'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';
export function Dialog({open,onClose,title,children,className=''}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();const [mounted,setMounted]=useState(false);
 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{const dialog=ref.current;if(!dialog)return;const trigger=document.activeElement as HTMLElement|null;if(open&&!dialog.open)dialog.showModal();if(!open&&dialog.open)dialog.close();return()=>{if(dialog.open)dialog.close();if(open)trigger?.focus();};},[open,mounted]);
 if(!mounted)return null;
 return createPortal(<dialog ref={ref} className={className} aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}} onClick={event=>{if(event.target===event.currentTarget)onClose();}}><div className="dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={20}/></button></div><div className="dialog-body">{children}</div></dialog>,document.body);
}
