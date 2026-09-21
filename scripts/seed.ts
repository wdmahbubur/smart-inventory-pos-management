import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

export const demoProducts=[
 {name:'Coke 1L',sku:'DR-001',category:'Drinks',unit:'bottle',cost:7000,price:10000,minimum:10,opening:10,icon:'bottle',color:'rose'},
 {name:'Sprite 1L',sku:'DR-002',category:'Drinks',unit:'bottle',cost:6500,price:9500,minimum:8,opening:5,icon:'bottle',color:'emerald'},
 {name:'Chips 50g',sku:'SN-001',category:'Snacks',unit:'pack',cost:3000,price:5000,minimum:5,opening:20,icon:'bag',color:'amber'},
 {name:'Milk 1L',sku:'DA-001',category:'Dairy',unit:'carton',cost:7000,price:9000,minimum:8,opening:3,icon:'milk',color:'blue'},
 {name:'Rice 5kg',sku:'GR-001',category:'Grocery',unit:'bag',cost:35000,price:40000,minimum:10,opening:4,icon:'bag',color:'sand'},
 {name:'Shampoo 180ml',sku:'PC-001',category:'Personal care',unit:'bottle',cost:15000,price:19000,minimum:5,opening:2,icon:'bottle',color:'violet'},
 {name:'Bread 400g',sku:'BA-001',category:'Bakery',unit:'pack',cost:3500,price:5000,minimum:5,opening:0,icon:'bread',color:'sand'}
] as const;
export interface SeedResult {ownerId:string;storeId:string;products:Record<string,{id:string;version:number}>;purchaseId:string;draftId:string;saleId:string|null;state:'pre-sale'|'post-sale'}
export async function seedDemo(connectionString:string,ownerId:string,state:'pre-sale'|'post-sale'):Promise<SeedResult>{
 if(!['127.0.0.1','localhost'].includes(new URL(connectionString).hostname)||process.env.SEED_ALLOW_LOCAL_DEMO!=='1')throw new Error('Seeding is restricted to explicitly enabled disposable localhost databases.');
 if(!/^[0-9a-f-]{36}$/i.test(ownerId)||!['pre-sale','post-sale'].includes(state))throw new Error('Supply an explicit designated demo owner and fixture state.');
 const db=new pg.Client({connectionString});await db.connect();
 try{await db.query('begin');
  const found=await db.query('select * from public.stores where owner_user_id=$1 for update',[ownerId]);const store=found.rows[0];
  if(!store?.is_demo)throw new Error('Refusing to seed a non-demo or missing store. Designate a NEW local demo owner explicitly first.');
  const existing=await db.query('select (select count(*) from public.products where store_id=$1)+(select count(*) from public.purchases where store_id=$1)+(select count(*) from public.sales where store_id=$1) n',[store.id]);
  if(Number(existing.rows[0].n)!==0)throw new Error('Refusing to overwrite a nonempty store. Reset the disposable local stack separately or use a new demo owner.');
  await db.query("update public.stores set next_purchase_number=11,next_sale_number=21,demo_clock='2026-09-18T04:35:00Z',phone='+880 1700 000000',address='Dhaka, Bangladesh' where id=$1",[store.id]);
  await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[ownerId]);
  async function rpc<T=Record<string,unknown>>(name:string,args:unknown[]):Promise<T>{if(!/^[a-z_]+$/.test(name))throw new Error('Invalid test RPC');const r=await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args);return r.rows[0].result as T;}
  const categories:Record<string,string>={},products:SeedResult['products']={};
  for(const p of demoProducts){if(!categories[p.category])categories[p.category]=(await rpc<{id:string}>('catalog_mutate',['category','save',{name:p.category,icon_key:p.icon,color_key:p.color},randomUUID()])).id;products[p.sku]=await rpc('catalog_mutate',['product','save',{name:p.name,sku:p.sku,category_id:categories[p.category],unit:p.unit,reference_cost_paisa:String(p.cost),selling_price_paisa:String(p.price),minimum_stock:p.minimum,icon_key:p.icon,color_key:p.color},randomUUID()]);}
  const supplier=await rpc<{id:string}>('catalog_mutate',['supplier','save',{name:'ABC Traders',phone:'+880 1800 000000',address:'Dhaka'},randomUUID()]);
  const opening=await rpc<{id:string}>('write_purchase',[{supplier_id:supplier.id,purchase_date:'2026-09-17',note:'Fixture-only P-0011 documents the reference images’ otherwise unexplained opening quantities.',items:demoProducts.filter(p=>p.opening>0).map(p=>({product_id:products[p.sku].id,quantity:p.opening,unit_cost_paisa:String(p.cost)}))},randomUUID(),true]);
  const received=await rpc<{id:string}>('write_purchase',[{supplier_id:supplier.id,purchase_date:'2026-09-18',supplier_reference:'INV-1042',items:[{product_id:products['DR-001'].id,quantity:20,unit_cost_paisa:'7000'},{product_id:products['DR-002'].id,quantity:10,unit_cost_paisa:'6500'}]},randomUUID(),true]);
  const draft=await rpc<{id:string}>('write_purchase',[{supplier_id:supplier.id,purchase_date:'2026-09-18',items:[{product_id:products['DA-001'].id,quantity:10,unit_cost_paisa:'7000'},{product_id:products['GR-001'].id,quantity:5,unit_cost_paisa:'35000'}]},randomUUID(),false]);
  const sale=state==='post-sale'?await rpc<{id:string}>('complete_sale',[{items:[{product_id:products['DR-001'].id,quantity:2,expected_price_paisa:'10000',expected_version:1},{product_id:products['SN-001'].id,quantity:3,expected_price_paisa:'5000',expected_version:1}],discount_paisa:'2000',cash_received_paisa:'50000'},randomUUID()]):null;
  // Stock, document items and movements above were created only through the real posting functions.
  // Privileged LOCAL fixture tooling changes timestamps only. No production clock/balance bypass exists.
  await db.query('set constraints all immediate');await db.query('reset role');
  await db.query('alter table public.purchases disable trigger guard_purchase; alter table public.sales disable trigger immutable_sales; alter table public.stock_movements disable trigger immutable_movements;');
  for(const [id,time] of [[opening.id,'2026-09-17T04:00:00Z'],[received.id,'2026-09-18T04:00:00Z']]){await db.query('update public.purchases set received_at=$2,updated_at=$2,created_at=$2 where id=$1',[id,time]);await db.query('update public.stock_movements m set created_at=$2 from public.purchase_items i where i.id=m.purchase_item_id and i.purchase_id=$1',[id,time]);}
  await db.query("update public.purchases set updated_at='2026-09-18T04:15:00Z',created_at='2026-09-18T04:15:00Z' where id=$1",[draft.id]);
  if(sale){await db.query("update public.sales set completed_at='2026-09-18T04:30:00Z',created_at='2026-09-18T04:30:00Z' where id=$1",[sale.id]);await db.query("update public.stock_movements m set created_at='2026-09-18T04:30:00Z' from public.sale_items i where i.id=m.sale_item_id and i.sale_id=$1",[sale.id]);}
  await db.query('alter table public.purchases enable trigger guard_purchase; alter table public.sales enable trigger immutable_sales; alter table public.stock_movements enable trigger immutable_movements;');
  const mismatch=await db.query('select b.product_id from public.inventory_balances b left join public.stock_movements m on m.product_id=b.product_id where b.store_id=$1 group by b.product_id,b.quantity having b.quantity<>coalesce(sum(m.quantity_delta),0)',[store.id]);assert.equal(mismatch.rowCount,0);
  const chain=await db.query('select * from (select quantity_before,lag(quantity_after,1,0) over(partition by product_id order by sequence) previous from public.stock_movements where store_id=$1) x where quantity_before<>previous',[store.id]);assert.equal(chain.rowCount,0);
  await db.query('set local role authenticated');const workspace=await rpc<{inventory:{value_paisa:string;units:number;attention_count:number};sales:{total_paisa:string;net_profit_paisa:string};purchases:{total_paisa:string}}>('get_workspace',[]);
  assert.equal(workspace.purchases.total_paisa,'205000');assert.equal(workspace.inventory.attention_count,4);
  if(state==='post-sale'){assert.equal(workspace.inventory.value_paisa,'535500');assert.equal(workspace.inventory.units,69);assert.equal(workspace.sales.total_paisa,'33000');assert.equal(workspace.sales.net_profit_paisa,'10000');}
  await db.query('commit');return {ownerId,storeId:store.id,products,purchaseId:received.id,draftId:draft.id,saleId:sale?.id??null,state};
 }catch(error){await db.query('rollback');throw error;}finally{await db.end();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await seedDemo(process.env.DATABASE_URL??'',process.env.DEMO_OWNER_ID??'',process.env.DEMO_STATE==='pre-sale'?'pre-sale':'post-sale');console.log(JSON.stringify({event:'demo_seeded',state:result.state,store_id:result.storeId,ledger_verified:true}));}
