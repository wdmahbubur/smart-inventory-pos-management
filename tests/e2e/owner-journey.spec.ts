import {test,expect,type Page} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??'';
async function emptyOwner(page:Page){
 if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Tests require disposable local Supabase.');
 const email=`journey-${randomUUID()}@example.test`,password=`Local-${randomUUID()}Aa1!`;
 const admin=createClient(url,process.env.SUPABASE_TEST_SERVICE_KEY!,{auth:{persistSession:false}});
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Journey Owner',store_name:'Journey Store'}});
 expect(created.error).toBeNull();
 await page.goto('/login');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/dashboard$/);
 return {email,password};
}
async function pick(page:Page,trigger:string,kind:string,name:string){
 await page.locator('button.picker-trigger').filter({hasText:trigger}).click();
 const dialog=page.getByRole('dialog');await dialog.getByLabel(`Search ${kind}`,{exact:true}).fill(name);
 await dialog.getByRole('button',{name:new RegExp(name)}).click();
}

test('fresh owner performs category/supplier/product CRUD, purchase, draft, sale, low-stock prefill and reconciled reports',async({page})=>{
 await emptyOwner(page);page.on('dialog',dialog=>void dialog.accept());
 await page.goto('/categories');await page.getByRole('button',{name:'Add category',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Category name').fill('Journey drinks');await page.getByRole('button',{name:'Save category',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.goto('/suppliers');await page.getByRole('button',{name:'Add supplier',exact:true}).click();
 await page.getByRole('dialog').getByLabel('Supplier name').fill('Journey supplier');await page.getByRole('button',{name:'Save supplier',exact:true}).click();await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.goto('/products/new');await page.getByLabel('Product name',{exact:true}).fill('Journey drink');await page.getByLabel('SKU',{exact:true}).fill('JOURNEY-001');
 await pick(page,'Select category','categories','Journey drinks');await page.getByLabel('Stock unit').selectOption('bottle');await page.getByLabel('Minimum stock',{exact:true}).fill('5');await page.getByLabel('Reference purchase cost (৳)').fill('70');await page.getByLabel('Selling price (৳)').fill('100');await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page).toHaveURL(/products$/);
 const initial=await (await page.request.get('/api/catalog?kind=products')).json();const id=initial.rows[0].id;expect(initial.rows[0].quantity).toBe(0);
 await page.goto('/purchases/new');await pick(page,'Select supplier','suppliers','Journey supplier');await pick(page,'Search and add a product','products','Journey drink');await page.getByLabel('Quantity of Journey drink').fill('10');await page.getByRole('button',{name:'Confirm purchase',exact:true}).click();await expect(page).toHaveURL(/purchases\/[0-9a-f-]+$/);await expect(page.getByText('৳700',{exact:true}).first()).toBeVisible();
 await page.goto('/purchases/new');await pick(page,'Select supplier','suppliers','Journey supplier');await pick(page,'Search and add a product','products','Journey drink');await page.getByLabel('Quantity of Journey drink').fill('4');await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page).toHaveURL(/purchases\/[0-9a-f-]+\/edit$/);
 expect((await (await page.request.get(`/api/catalog?kind=products&id=${id}`)).json()).result.quantity).toBe(10);
 await page.goto('/pos');for(let n=0;n<8;n++)await page.getByRole('button',{name:'Add Journey drink to cart',exact:true}).click();await page.getByLabel('Order discount (৳)').fill('20');await page.getByLabel('Cash received (৳)').fill('1000');await page.getByRole('button',{name:'Complete sale',exact:true}).click();await expect(page).toHaveURL(/sales\/[0-9a-f-]+$/);await expect(page.getByText('৳780',{exact:true})).toBeVisible();await expect(page.getByText('৳220',{exact:true})).toBeVisible();
 const receipt=page.url();expect((await (await page.request.get(`/api/catalog?kind=products&id=${id}`)).json()).result.quantity).toBe(2);
 await page.goto('/inventory/low-stock');await expect(page.getByRole('row').filter({hasText:'Journey drink'})).toContainText('Low stock');await page.getByRole('link',{name:'Add to purchase',exact:true}).click();await expect(page.getByLabel('Quantity of Journey drink')).toHaveValue('3');
 await page.goto('/reports/sales');await expect(page.getByText('৳780',{exact:true}).first()).toBeVisible();await page.goto('/reports/purchases');await expect(page.getByText('৳700',{exact:true}).first()).toBeVisible();
 await page.goto(`/products/${id}/edit`);await page.getByLabel('Selling price (৳)').fill('110');await page.getByRole('button',{name:'Save product',exact:true}).click();await expect(page).toHaveURL(/products$/);await page.goto(receipt);await expect(page.getByText('৳780',{exact:true})).toBeVisible();
 // Thermal mode uses the saved receipt, and printing/reloading does not post again.
 await page.getByRole('combobox',{name:'Receipt print format'}).selectOption('thermal');await page.evaluate(()=>{window.print=()=>undefined;});await page.getByRole('button',{name:'Print receipt',exact:true}).click();await page.emulateMedia({media:'print'});await expect(page.locator('.receipt')).toHaveClass(/thermal/);await expect(page.locator('.sidebar')).toBeHidden();await page.emulateMedia({media:'screen'});
 expect((await (await page.request.get(`/api/catalog?kind=products&id=${id}`)).json()).result.quantity).toBe(2);
});

test('real authenticated PostgREST concurrent checkout cannot oversell or duplicate a successful operation',async({page})=>{
 const credentials=await emptyOwner(page);
 const client=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});expect((await client.auth.signInWithPassword(credentials)).error).toBeNull();
 async function catalog(kind:string,payload:object){const result=await client.rpc('catalog_mutate',{p_kind:kind,p_action:'save',p_payload:payload,p_request_id:randomUUID()});expect(result.error).toBeNull();return result.data;}
 const category=await catalog('category',{name:'Concurrent'}),supplier=await catalog('supplier',{name:'Concurrent supplier'});
 const product=await catalog('product',{name:'Last unit',sku:'LAST',category_id:category.id,unit:'piece',reference_cost_paisa:'50',selling_price_paisa:'100',minimum_stock:0});
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const stock=await client.rpc('write_purchase',{p_payload:{supplier_id:supplier.id,purchase_date:date,items:[{product_id:product.id,quantity:1,unit_cost_paisa:'50'}]},p_request_id:randomUUID(),p_receive:true});expect(stock.error).toBeNull();
 const payload={items:[{product_id:product.id,quantity:1,expected_price_paisa:'100',expected_version:1}],discount_paisa:'0',cash_received_paisa:'100'};
 const keys=[randomUUID(),randomUUID()];const attempts=await Promise.all(keys.map(key=>client.rpc('complete_sale',{p_payload:payload,p_request_id:key})));
 expect(attempts.filter(r=>!r.error)).toHaveLength(1);expect(attempts.filter(r=>r.error?.message==='INSUFFICIENT_STOCK')).toHaveLength(1);
 const winner=attempts.findIndex(r=>!r.error);const replay=await client.rpc('complete_sale',{p_payload:payload,p_request_id:keys[winner]});expect(replay.error).toBeNull();expect(replay.data.id).toBe(attempts[winner].data.id);
 const current=await client.from('inventory_balances').select('quantity').eq('product_id',product.id).single();expect(current.data?.quantity).toBe(0);await client.auth.signOut();
});
