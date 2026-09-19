import {test,expect,type Page} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import type {SeedResult} from '../../scripts/seed';
interface Fixture extends SeedResult {email:string}
const fixtures=JSON.parse(readFileSync('.local-browser-fixtures.json','utf8')) as {password:string;'pre-sale':Fixture;'post-sale':Fixture};
async function login(page:Page,state:'pre-sale'|'post-sale'='post-sale'){
 await page.goto('/login');await page.getByLabel('Email address').fill(fixtures[state].email);await page.getByLabel('Password',{exact:true}).fill(fixtures.password);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/\/dashboard$/);await expect(page.getByRole('heading',{name:'Dashboard',exact:true})).toBeVisible();
}
async function emailLink(email:string,subject:string):Promise<string>{
 let id='';await expect.poll(async()=>{const response=await fetch('http://127.0.0.1:54324/api/v1/messages');if(!response.ok)return '';const data=await response.json() as {messages:{ID:string;Subject:string;To:{Address:string}[]}[]};id=data.messages.find(m=>m.To.some(to=>to.Address===email)&&m.Subject.toLowerCase().includes(subject))?.ID??'';return id;},{timeout:30000}).not.toBe('');
 const message=await (await fetch(`http://127.0.0.1:54324/api/v1/message/${id}`)).json() as {HTML:string;Text:string};
 const link=message.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1]??message.Text.match(/https?:\/\/[^\s]+\/auth\/v1\/verify[^\s]+/)?.[0];if(!link)throw new Error('Local Auth email did not contain a verification link.');return link.replaceAll('&amp;','&');
}
async function capture(page:Page,name:string,width:number){await page.evaluate(()=>document.fonts.ready);mkdirSync(`test-results/screenshots/${width}`,{recursive:true});await page.screenshot({path:`test-results/screenshots/${width}/${name}.png`,fullPage:true,animations:'disabled'});}
async function noOverflow(page:Page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);}

test('actual signup, verification email, empty store and password recovery',async({page})=>{
 const email=`owner-${randomUUID()}@example.test`,password=`Secure-${randomUUID()}Aa1!`;
 await page.goto('/register');await page.getByLabel('Full name',{exact:true}).fill('Browser Owner');await page.getByLabel('Store name',{exact:true}).fill('Browser Test Store');await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password').fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL(/verify-email/);
 await page.goto(await emailLink(email,'confirm'));await expect(page).toHaveURL(/dashboard$/);await expect(page.getByText('No posted activity yet')).toBeVisible();
 const response=await page.request.get('/api/catalog?kind=products');expect(response.status()).toBe(200);expect((await response.json()).total).toBe(0);
 await page.getByRole('button',{name:'Log out',exact:true}).click();await expect(page).toHaveURL(/login$/);
 await page.goto('/forgot-password');await page.getByLabel('Email address').fill(email);await page.getByRole('button',{name:'Send reset link'}).click();await expect(page.getByText('If an account exists for this email, password-reset instructions will be sent.',{exact:false})).toBeVisible();
 await page.goto(await emailLink(email,'reset'));await expect(page).toHaveURL(/reset-password/);const changed=`Changed-${randomUUID()}Aa1!`;await page.getByLabel('New password',{exact:true}).fill(changed);await page.getByLabel('Confirm password').fill(changed);await page.getByRole('button',{name:'Update password'}).click();await expect(page).toHaveURL(/login\?reset=success/);
 await page.getByLabel('Email address').fill(email);await page.getByLabel('Password',{exact:true}).fill(changed);await page.getByRole('button',{name:'Log in',exact:true}).click();await expect(page).toHaveURL(/dashboard$/);
});

test('real Auth JWT and PostgREST isolate owners, forbid balance writes and authorize exports',async({page})=>{
 await login(page);const other=fixtures['pre-sale'];const response=await page.request.get(`/api/catalog?kind=products&id=${other.products['DR-001'].id}`);expect(response.status()).toBe(404);
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{auth:{persistSession:false}});const signIn=await client.auth.signInWithPassword({email:fixtures['post-sale'].email,password:fixtures.password});expect(signIn.error).toBeNull();
 const select=await client.from('products').select('id').eq('id',other.products['DR-001'].id);expect(select.error).toBeNull();expect(select.data).toEqual([]);
 const write=await client.from('inventory_balances').update({quantity:999}).eq('product_id',fixtures['post-sale'].products['DR-001'].id);expect(write.error).not.toBeNull();
 const exported=await page.request.get('/api/reports/sales/export?from=2026-09-18&to=2026-09-18');expect(exported.status()).toBe(200);const csv=await exported.text();expect(csv).toContain('200.00');expect(csv).toContain('150.00');expect(csv).toContain('20.00');
 const forged=await page.request.post('/api/mutate',{headers:{Origin:'https://untrusted.invalid'},data:{operation:'complete_sale',request_id:randomUUID(),payload:{}}});expect(forged.status()).toBe(400);await client.auth.signOut();
});

test('draft isolation, responsive POS, lost checkout response and same-receipt recovery',async({page})=>{
 await login(page,'pre-sale');page.on('dialog',dialog=>void dialog.accept());
 await page.goto(`/purchases/${fixtures['pre-sale'].draftId}/edit`);await expect(page.getByRole('heading',{name:'Edit draft P-0013'})).toBeVisible();
 const stockBefore=await page.request.get(`/api/catalog?kind=products&id=${fixtures['pre-sale'].products['DA-001'].id}`);expect((await stockBefore.json()).result.quantity).toBe(3);
 await page.goto('/pos');await page.getByRole('button',{name:'Add Coke 1L to cart',exact:true}).click();await page.getByRole('button',{name:'Add Coke 1L to cart',exact:true}).click();for(let i=0;i<3;i++)await page.getByRole('button',{name:'Add Chips 50g to cart',exact:true}).click();
 await page.getByLabel('Order discount (৳)').fill('20');await page.getByLabel('Cash received (৳)').fill('500');await capture(page,'13-POS-presale',1440);
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:/View cart/}).click();await noOverflow(page);await expect(page.getByRole('button',{name:'Complete sale',exact:true})).toBeVisible();await capture(page,'13-POS-cart-presale',390);
 let intercepted=false;await page.route('**/api/mutate',async route=>{if(!intercepted&&route.request().postDataJSON().operation==='complete_sale'){intercepted=true;await route.fetch();await route.abort('connectionfailed');}else await route.continue();});
 await page.getByRole('button',{name:'Complete sale',exact:true}).click();await expect(page.getByRole('button',{name:'Check operation status'})).toBeVisible();await page.getByRole('button',{name:'Check operation status'}).click();await expect(page).toHaveURL(/\/sales\/[0-9a-f-]+$/);await expect(page.getByText('৳330',{exact:true})).toBeVisible();await expect(page.getByText('৳170',{exact:true})).toBeVisible();
 await page.reload();const coke=await page.request.get(`/api/catalog?kind=products&id=${fixtures['pre-sale'].products['DR-001'].id}`);expect((await coke.json()).result.quantity).toBe(28);
 await page.setViewportSize({width:1440,height:1024});await page.emulateMedia({media:'print'});await capture(page,'receipt-a4',1440);await expect(page.locator('.sidebar')).toBeHidden();await page.emulateMedia({media:'screen'});
});

test('missing AI keeps source facts and keyboard dialog restores focus',async({page})=>{
 await login(page);await page.goto('/insights');await expect(page.getByRole('heading',{name:'Source facts',exact:true})).toBeVisible();await page.getByRole('button',{name:'Generate insight',exact:true}).click();await expect(page.getByText('AI is not configured.',{exact:false})).toBeVisible();await expect(page.getByRole('heading',{name:'Source facts',exact:true})).toBeVisible();
 await page.goto('/categories');const trigger=page.getByRole('button',{name:'Add category',exact:true});await trigger.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await expect(page.getByLabel('Category name',{exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).not.toBeVisible();await expect(trigger).toBeFocused();
});

for(const width of [360,390,768,1024,1440,1920])test(`all 22 reference routes render without page overflow at ${width}px`,async({page})=>{
 test.setTimeout(240000);await page.setViewportSize({width,height:width<768?844:1024});
 for(const [name,path]of [['01-Landing','/'],['02-Registration','/register'],['03-Login','/login'],['04-Password-Recovery','/forgot-password']]){await page.goto(path);await expect(page.locator('h1')).toBeVisible();await noOverflow(page);if(width===1440||width===390)await capture(page,name,width);}
 await login(page);const f=fixtures['post-sale'];
 const routes=[['05-Dashboard','/dashboard'],['06-Products','/products'],['07-Add-Product','/products/new'],['08-Categories','/categories'],['09-Suppliers','/suppliers'],['10-Purchase-History','/purchases?from=2026-09-18&to=2026-09-18'],['11-New-Purchase',`/purchases/${f.draftId}/edit`],['12-Purchase-Details',`/purchases/${f.purchaseId}`],['13-POS','/pos'],['14-Sales-History','/sales'],['15-Sales-Receipt',`/sales/${f.saleId}`],['16-Current-Inventory','/inventory'],['17-Stock-Movement','/inventory/movements?from=2026-09-18&to=2026-09-18'],['18-Low-Stock','/inventory/low-stock'],['19-Sales-Report','/reports/sales?from=2026-09-18&to=2026-09-18'],['20-Purchase-Report','/reports/purchases?from=2026-09-18&to=2026-09-18'],['21-Inventory-Report','/reports/inventory'],['22-AI-Insights','/insights']];
 for(const [name,path]of routes){await page.goto(path);await expect(page.locator('.page-heading h1')).toBeVisible();await expect(page.getByText('We could not load this page')).not.toBeVisible();await noOverflow(page);if(width===1440||width===390)await capture(page,name,width);}
});

test('unauthenticated reads and exports never expose a store',async({page})=>{await page.goto('/dashboard');await expect(page).toHaveURL(/login/);expect((await page.request.get('/api/catalog?kind=products')).status()).toBe(401);expect((await page.request.get('/api/reports/inventory/export')).status()).toBe(401);expect((await page.request.get('/api/insights')).status()).toBe(401);});
