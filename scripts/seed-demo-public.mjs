import {createClient} from '@supabase/supabase-js';

const url=process.env.DEMO_SUPABASE_URL;
const key=process.env.DEMO_SUPABASE_KEY;
const email=process.env.DEMO_EMAIL;
const password=process.env.DEMO_PASSWORD;
if(!url||!key||!email||!password) throw new Error('Missing demo bootstrap configuration.');

const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

async function ensureSession(){
  const signed=await client.auth.signInWithPassword({email,password});
  if(!signed.error && signed.data.session) return signed.data.session;
  const created=await client.auth.signUp({
    email,password,
    options:{data:{full_name:'Mahin Ahmed',store_name:'Green Mart Grocery'}}
  });
  if(created.error) throw created.error;
  if(!created.data.session) throw new Error('EMAIL_CONFIRMATION_REQUIRED: demo user was created but production email confirmation must be completed before seeding.');
  return created.data.session;
}
await ensureSession();

async function rpc(name,args){
  const {data,error}=await client.rpc(name,args);
  if(error) throw new Error(`${name}: ${error.message}`);
  return data;
}
await rpc('create_owner_store',{});

const existing=await rpc('list_catalog',{p_kind:'products',p_filters:{page:1,size:20}});
if((existing?.total??0)>0){
  const workspace=await rpc('get_workspace',{});
  console.log(JSON.stringify({status:'already_seeded',email,products:existing.total,workspace},null,2));
  process.exit(0);
}

async function catalog(kind,payload){
  return rpc('catalog_mutate',{p_kind:kind,p_action:'save',p_payload:payload,p_request_id:crypto.randomUUID()});
}
const categories={};
for(const row of [
  {name:'Beverages',description:'Cold drinks, water and dairy',icon_key:'bottle',color_key:'blue'},
  {name:'Snacks',description:'Quick snacks and biscuits',icon_key:'package',color_key:'amber'},
  {name:'Grocery',description:'Everyday pantry essentials',icon_key:'bag',color_key:'emerald'},
  {name:'Personal Care',description:'Personal and household care',icon_key:'store',color_key:'violet'},
]) categories[row.name]=(await catalog('category',row)).id;

const suppliers={};
for(const row of [
  {name:'Dhaka Wholesale Ltd',phone:'01711-223344',address:'Tejgaon Industrial Area, Dhaka'},
  {name:'FreshMart Distributors',phone:'01819-445566',address:'Kawran Bazar, Dhaka'},
  {name:'Daily Needs Supply',phone:'01912-778899',address:'Mirpur-1, Dhaka'},
]) suppliers[row.name]=(await catalog('supplier',row)).id;

const productRows=[
  {key:'COKE',name:'Coca-Cola 500ml',sku:'COKE-500',cat:'Beverages',unit:'bottle',cost:'4500',price:'6000',min:8,icon_key:'bottle',color_key:'rose'},
  {key:'SPRITE',name:'Sprite 500ml',sku:'SPRITE-500',cat:'Beverages',unit:'bottle',cost:'4200',price:'6000',min:6,icon_key:'bottle',color_key:'emerald'},
  {key:'WATER',name:'Mineral Water 1L',sku:'WATER-1L',cat:'Beverages',unit:'bottle',cost:'1800',price:'3000',min:10,icon_key:'bottle',color_key:'blue'},
  {key:'CHIPS',name:'Potato Chips 25g',sku:'CHIPS-25',cat:'Snacks',unit:'pack',cost:'2000',price:'3500',min:8,icon_key:'package',color_key:'amber'},
  {key:'BISCUIT',name:'Biscuits Family Pack',sku:'BISCUIT-FAM',cat:'Snacks',unit:'pack',cost:'5500',price:'8000',min:5,icon_key:'package',color_key:'sand'},
  {key:'MILK',name:'Milk 1L',sku:'MILK-1L',cat:'Grocery',unit:'bottle',cost:'7800',price:'9500',min:6,icon_key:'milk',color_key:'blue'},
  {key:'RICE',name:'Miniket Rice 5kg',sku:'RICE-5KG',cat:'Grocery',unit:'bag',cost:'36000',price:'42000',min:4,icon_key:'bag',color_key:'emerald'},
  {key:'OIL',name:'Soybean Oil 2L',sku:'OIL-2L',cat:'Grocery',unit:'bottle',cost:'34000',price:'39000',min:4,icon_key:'bottle',color_key:'amber'},
  {key:'SHAMPOO',name:'Shampoo 180ml',sku:'SHAMPOO-180',cat:'Personal Care',unit:'bottle',cost:'21000',price:'26000',min:3,icon_key:'bottle',color_key:'violet'},
  {key:'SOAP',name:'Bath Soap 100g',sku:'SOAP-100',cat:'Personal Care',unit:'piece',cost:'5000',price:'6500',min:6,icon_key:'package',color_key:'rose'},
];
const products={};
for(const p of productRows){
  const created=await catalog('product',{
    name:p.name,sku:p.sku,category_id:categories[p.cat],unit:p.unit,minimum_stock:p.min,
    reference_cost_paisa:p.cost,selling_price_paisa:p.price,
    description:`Demo catalog item · ${p.name}`,icon_key:p.icon_key,color_key:p.color_key
  });
  products[p.key]={...created,price:p.price};
}

async function purchase(supplier,purchase_date,items,p_receive,note){
  return rpc('write_purchase',{
    p_payload:{
      supplier_id:suppliers[supplier],purchase_date,note,
      items:items.map(([key,quantity,cost])=>({product_id:products[key].id,quantity,unit_cost_paisa:cost}))
    },
    p_request_id:crypto.randomUUID(),p_receive
  });
}
await purchase('Dhaka Wholesale Ltd','2026-09-17',[
  ['COKE',36,'4500'],['SPRITE',24,'4200'],['WATER',30,'1800'],['CHIPS',24,'2000']
],true,'Opening beverage and snack replenishment');
await purchase('FreshMart Distributors','2026-09-18',[
  ['BISCUIT',10,'5500'],['MILK',12,'7800'],['RICE',8,'36000'],['OIL',8,'34000']
],true,'Weekly grocery delivery');
await purchase('Daily Needs Supply','2026-09-19',[
  ['SHAMPOO',6,'21000'],['SOAP',12,'5000']
],true,'Personal care restock');
await purchase('FreshMart Distributors','2026-09-20',[
  ['COKE',12,'4500'],['MILK',6,'8000']
],false,'Draft: planned top-up for next delivery');

async function sale(items,discount_paisa,cash_received_paisa,customer_name,customer_phone){
  const payload={
    items:items.map(([key,quantity])=>({
      product_id:products[key].id,quantity,expected_price_paisa:products[key].price,expected_version:1
    })),
    discount_paisa,cash_received_paisa,customer_name
  };
  if(customer_phone) payload.customer_phone=customer_phone;
  return rpc('complete_sale',{p_payload:payload,p_request_id:crypto.randomUUID()});
}
await sale([['COKE',2],['CHIPS',1],['MILK',1]],'1000','50000','Rahim Uddin','01700-100001');
await sale([['RICE',1],['OIL',1],['WATER',2]],'2000','100000','Nusrat Jahan','01800-100002');
await sale([['SPRITE',2],['SOAP',2],['BISCUIT',1]],'0','50000','Walk-in customer');
await sale([['COKE',8],['WATER',10],['CHIPS',8]],'1000','120000','Nearby Office','01900-100003');
await sale([['MILK',4],['SHAMPOO',6],['RICE',2]],'2000','300000','Mizan Store','01700-100004');
await sale([['SPRITE',6],['BISCUIT',5],['OIL',3],['SOAP',4],['COKE',4],['CHIPS',8],['MILK',2]],'3000','300000','Evening walk-in sales');

const [workspace,inventory,sales,purchases]=await Promise.all([
  rpc('get_workspace',{}),
  rpc('get_report',{p_kind:'inventory',p_filters:{},p_export:false}),
  rpc('get_report',{p_kind:'sales',p_filters:{from:'2026-09-20',to:'2026-09-20'},p_export:false}),
  rpc('get_report',{p_kind:'purchases',p_filters:{from:'2026-09-17',to:'2026-09-20'},p_export:false}),
]);
const finalCatalog=await rpc('list_catalog',{p_kind:'products',p_filters:{page:1,size:20,sort:'name_asc'}});
console.log(JSON.stringify({
  status:'seeded',
  owner:'Mahin Ahmed',
  store:'Green Mart Grocery',
  email,
  categories:Object.keys(categories).length,
  suppliers:Object.keys(suppliers).length,
  products:finalCatalog.total,
  received_purchases:3,
  purchase_drafts:1,
  completed_sales:6,
  workspace,
  inventory_summary:inventory?.summary??null,
  sales_summary:sales?.summary??null,
  purchase_summary:purchases?.summary??null,
  stock:finalCatalog.rows.map(p=>({sku:p.sku,name:p.name,quantity:p.quantity,minimum_stock:p.minimum_stock,status:p.stock_status}))
},null,2));
await client.auth.signOut();
