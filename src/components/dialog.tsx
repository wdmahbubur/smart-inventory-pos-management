'use client';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {X} from 'lucide-react';

/** Native modal semantics provide focus trapping and make the background inert. */
export function Dialog({open,onClose,title,children,className=''}:{open:boolean;onClose:()=>void;title:string;children:ReactNode;className?:string}){
 const ref=useRef<HTMLDialogElement>(null),titleId=useId();
 const [mounted,setMounted]=useState(false);
 useEffect(()=>{setMounted(true);},[]);
 useEffect(()=>{
  const dialog=ref.current;
  if(!dialog||!open)return;
  const trigger=document.activeElement instanceof HTMLElement?document.activeElement:null;
  dialog.showModal();
  dialog.querySelector<HTMLElement>('input:not([disabled]):not([type=hidden]),textarea:not([disabled]),select:not([disabled]),[data-autofocus]')?.focus();
  return()=>{
   dialog.close();
   if(trigger?.isConnected)trigger.focus();
  };
 },[open,mounted]);
 if(!mounted||!open)return null;
 return createPortal(
  <dialog ref={ref} className={className} aria-labelledby={titleId}
   onCancel={event=>{event.preventDefault();onClose();}}
   onClick={event=>{
    if(event.target!==event.currentTarget)return;
    const box=event.currentTarget.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();
   }}>
   <div className="dialog-head"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={20}/></button></div>
   <div className="dialog-body">{children}</div>
  </dialog>,document.body
 );
}
