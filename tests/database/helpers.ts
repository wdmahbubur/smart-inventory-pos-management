import pg from 'pg';
import { randomUUID } from 'node:crypto';
const connectionString=process.env.DATABASE_TEST_URL ?? 'postgresql://postgres@127.0.0.1:54322/smart_inventory_test';
const parsed=new URL(connectionString);
if (!['127.0.0.1','localhost'].includes(parsed.hostname) || !parsed.pathname.endsWith('_test')) throw new Error('Tests require a disposable localhost database with a name ending _test.');
export const pool=new pg.Pool({connectionString,max:12});
export const uid=randomUUID;
export async function asOwner<T=unknown>(id:string,sql:string,values:unknown[]=[]):Promise<T[]> {
 const c=await pool.connect();
 try { await c.query('begin'); await c.query('set local role authenticated'); await c.query("select set_config('request.jwt.claim.sub',$1,true)",[id]); const r=await c.query(sql,values); await c.query('commit'); return r.rows as T[]; }
 catch(e){ await c.query('rollback'); throw e; } finally { c.release(); }
}
export async function rpc<T=Record<string,unknown>>(owner:string,fn:string,args:unknown[]):Promise<T> {
 if(!/^[a-z_]+$/.test(fn)) throw new Error('Invalid test function');
 const r=await asOwner<{result:T}>(owner,`select public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as result`,args);
 return r[0].result;
}
export async function owner() {const id=uid(); await pool.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)',[id,`${id}@example.test`,{full_name:'Test Owner',store_name:'Test Store'}]);return id;}
export async function base() {
 const user=await owner(); const category=await rpc<{id:string}>(user,'catalog_mutate',['category','save',{name:'Drinks'},uid()]);
 const supplier=await rpc<{id:string}>(user,'catalog_mutate',['supplier','save',{name:'ABC Traders'},uid()]);
 return {user,category:category.id,supplier:supplier.id};
}
export async function product(ctx:{user:string,category:string},sku=uid().slice(0,8),price='10000') {
 const payload={name:sku,sku,category_id:ctx.category,unit:'bottle',reference_cost_paisa:'7000',selling_price_paisa:price,minimum_stock:10};
 const result=await rpc<{id:string,version:number}>(ctx.user,'catalog_mutate',['product','save',payload,uid()]);return {...result,payload};
}
export const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const purchase=(supplier:string,items:{product_id:string,quantity:number,unit_cost_paisa:string}[])=>({supplier_id:supplier,purchase_date:today(),items});
export const sale=(id:string,quantity=1,price='10000',version=1)=>({items:[{product_id:id,quantity,expected_price_paisa:price,expected_version:version}],discount_paisa:'0',cash_received_paisa:String(BigInt(price)*BigInt(quantity))});
export async function balance(user:string,id:string){return (await asOwner<{quantity:number}>(user,'select quantity from public.inventory_balances where product_id=$1',[id]))[0]?.quantity;}
