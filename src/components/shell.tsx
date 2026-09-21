'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {usePathname,useRouter} from 'next/navigation';
import {LayoutDashboard,Package,Shapes,Truck,ShoppingBag,ShoppingCart,ReceiptText,Boxes,History,TriangleAlert,ChartNoAxesCombined,Sparkles,Menu,ChevronDown,ChevronRight,Store,LogOut,CalendarDays} from 'lucide-react';
import {Logo} from './brand';
import {Dialog} from './dialog';
import {WorkspaceContext} from './workspace-context';
import {StoreEditor} from '@/features/catalog-editor';
import {logout} from '@/app/auth/actions';
import {displayDate} from '@/lib/dates';
import type {Workspace} from '@/lib/domain';
const navigation=[
 {label:'Workspace',items:[{href:'/dashboard',label:'Dashboard',icon:LayoutDashboard},{href:'/products',label:'Products',icon:Package},{href:'/categories',label:'Categories',icon:Shapes},{href:'/suppliers',label:'Suppliers',icon:Truck}]},
 {label:'Operations',items:[{href:'/purchases',label:'Purchases',icon:ShoppingBag},{href:'/pos',label:'Point of sale',icon:ShoppingCart},{href:'/sales',label:'Sales',icon:ReceiptText}]},
 {label:'Stock control',items:[{href:'/inventory',label:'Inventory',icon:Boxes},{href:'/inventory/movements',label:'Stock history',icon:History},{href:'/inventory/low-stock',label:'Low stock',icon:TriangleAlert}]},
 {label:'Insights',items:[{href:'/reports',label:'Reports',icon:ChartNoAxesCombined},{href:'/insights',label:'AI suggestions',icon:Sparkles}]}
];
function activeRoute(path:string,href:string){if(href==='/inventory')return path==='/inventory';return path===href||path.startsWith(href+'/');}
export function Shell({workspace,children}:{workspace:Workspace;children:React.ReactNode}){
 const path=usePathname(),router=useRouter();const [drawer,setDrawer]=useState(false),[storeOpen,setStoreOpen]=useState(false);
 useEffect(()=>{setDrawer(false);},[path]);
 useEffect(()=>{const refresh=()=>router.refresh();window.addEventListener('si:data-changed',refresh);return()=>window.removeEventListener('si:data-changed',refresh);},[router]);
 const current=navigation.flatMap(x=>x.items).filter(x=>activeRoute(path,x.href)).at(-1);const group=navigation.find(g=>g.items.some(i=>i===current));
 const initials=workspace.profile.display_name.split(' ').map(x=>x[0]).slice(0,2).join('').toUpperCase();
 function links(){return <nav className="navigation" aria-label="Store navigation">{navigation.map(group=><div className="nav-group" key={group.label}><span className="nav-group-title">{group.label}</span>{group.items.map(item=><Link href={item.href} key={item.href} className={`nav-link ${activeRoute(path,item.href)?'active':''}`} aria-current={activeRoute(path,item.href)?'page':undefined} onClick={()=>setDrawer(false)}><item.icon size={18} strokeWidth={1.65}/>{item.label}{item.href==='/inventory/low-stock'&&workspace.inventory.attention_count>0&&<span className="nav-count">{workspace.inventory.attention_count}</span>}</Link>)}</div>)}</nav>;}
 function storeButton(){return <button className="store-switch" type="button" onClick={()=>{setDrawer(false);setStoreOpen(true);}}><span className="swatch"><Store size={20}/></span><span><strong>{workspace.store.name}</strong><small>Store workspace</small></span><ChevronDown size={13}/></button>;}
 function signOut(){try{for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith('si:'))sessionStorage.removeItem(key);}}catch{/* The provider still ends the current session. */}}
 return <WorkspaceContext.Provider value={workspace}><aside className="sidebar"><Logo/>{storeButton()}{links()}<div className="owner-block"><span className="avatar">{initials}</span><span><strong className="small">{workspace.profile.display_name}</strong><small>Store owner</small></span><form action={logout} onSubmit={signOut}><button className="icon-button" aria-label="Log out" type="submit"><LogOut size={16}/></button></form></div></aside><Dialog open={drawer} onClose={()=>setDrawer(false)} title="Store navigation" className="drawer-dialog"><Logo/>{storeButton()}{links()}<form action={logout} onSubmit={signOut}><button className="button full" type="submit"><LogOut size={16}/>Log out</button></form></Dialog><div className="app-shell"><header className="topbar"><div className="row"><button className="icon-button mobile-menu" aria-label="Open navigation" aria-expanded={drawer} onClick={()=>setDrawer(true)}><Menu size={21}/></button><div className="crumbs"><span>{group?.label??'Workspace'}</span><ChevronRight size={12}/><strong>{current?.label??'Dashboard'}</strong></div></div><div className="top-meta"><span className="row top-date"><CalendarDays size={14}/>{displayDate(workspace.business_date)}</span>{workspace.store.is_demo&&<span className="badge demo-label">Demo store</span>}<button className="profile-button" onClick={()=>setStoreOpen(true)}><span className="avatar">{initials}</span><span className="profile-name">{workspace.profile.display_name.split(' ')[0]}</span><ChevronDown size={12}/></button></div></header><main className="page-content" id="main-content">{children}<footer className="app-footer"><span>Smart Inventory · {workspace.store.name}</span><span>Stock is updated by confirmed purchases and sales</span></footer></main></div><StoreEditor open={storeOpen} onClose={()=>setStoreOpen(false)}/></WorkspaceContext.Provider>;
}
