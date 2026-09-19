"""Browser acceptance with explicit HTTP fixtures, NOT live Supabase verification.
Start the native server first. Install Playwright Chromium or set CHROMIUM_PATH.
"""
import json, os, time
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright, expect
BASE=os.getenv('TEST_BASE_URL','http://127.0.0.1:5173')
ART=Path('artifacts');ART.mkdir(exist_ok=True)
ORG='11111111-1111-4111-8111-111111111111';USER='22222222-2222-4222-8222-222222222222'
P1='33333333-3333-4333-8333-333333333333';P2='44444444-4444-4444-8444-444444444444';CAT='55555555-5555-4555-8555-555555555555';SALE='66666666-6666-4666-8666-666666666666';PO='77777777-7777-4777-8777-777777777777'
URL='https://fixture.supabase.co';KEY='sb_publishable_fixture_not_real_1234567890'
now='2026-09-19T10:00:00Z'
org=dict(id=ORG,name='Northside Market',currency='BDT',timezone='Asia/Dhaka',tax_bps=0,address='Test fixture address',phone='',receipt_footer='Thank you for shopping locally.')
products=[dict(id=P1,org_id=ORG,name='Premium rice',sku='RICE-1',barcode='123456789',price_minor=30000,cost_minor=20000,stock=10,reorder_level=5,unit='pcs',category_id=CAT,active=True,low_stock=False,created_at=now),dict(id=P2,org_id=ORG,name='Green tea',sku='TEA-1',barcode=None,price_minor=18000,cost_minor=12000,stock=2,reorder_level=5,unit='pcs',category_id=CAT,active=True,low_stock=True,created_at=now)]
class Fixture:
    def __init__(self,role='owner'): self.role=role;self.calls=[];self.sales=[];self.purchases=[];self.items=[];self.poitems=[];self.uncertain=False;self.results={};self.products=json.loads(json.dumps(products))
    def handle(self,route):
        req=route.request;u=urlparse(req.url);q=parse_qs(u.query);path=u.path
        if req.method=='OPTIONS':route.fulfill(status=204,headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'});return
        body=req.post_data_json if req.method in ['POST','PUT'] and req.post_data else {};status=200;data=[]
        if path=='/auth/v1/settings': data={}
        elif path=='/auth/v1/user':data={'id':USER,'email':'owner@example.test'}
        elif path.startswith('/auth/v1/token'): data={'access_token':'fixture-token','refresh_token':'fixture-refresh','expires_in':3600,'user':{'id':USER,'email':'owner@example.test'}}
        elif path=='/rest/v1/si_members':data=[dict(org_id=ORG,user_id=USER,email='owner@example.test',role=self.role,active=True)]
        elif path=='/rest/v1/si_organizations':data=[org]
        elif path=='/rest/v1/si_products':data=self.products
        elif path=='/rest/v1/si_categories':data=[dict(id=CAT,org_id=ORG,name='Groceries',active=True)]
        elif path=='/rest/v1/si_contacts':data=[]
        elif path=='/rest/v1/si_sales':data=self.sales
        elif path=='/rest/v1/si_sale_items':data=self.items
        elif path=='/rest/v1/si_purchases':data=self.purchases
        elif path=='/rest/v1/si_purchase_items':data=self.poitems
        elif path in ['/rest/v1/si_stock_movements','/rest/v1/si_payments','/rest/v1/si_returns','/rest/v1/si_audit']:data=[]
        elif path=='/rest/v1/rpc/si_dashboard':data={'today_sales_minor':60000,'today_returns_minor':0,'today_orders':2,'product_count':len(self.products),'stock_units':12,'low_stock_count':1,'low_stock':[self.products[1]],'recent_sales':self.sales,'daily':[{'date':f'2026-09-{d:02d}','sales_minor':(d-12)*12000,'returns_minor':0} for d in range(13,20)]}
        elif path=='/rest/v1/rpc/si_ai_context':data={'dashboard':{'product_count':2,'stock_units':12,'low_stock_count':1},'low_stock':[self.products[1]]}
        elif path=='/rest/v1/rpc/si_report':data={'summary':{k:60000 for k in ['sales_minor','returns_minor','net_sales_minor','net_tax_minor','revenue_minor','cogs_minor','gross_profit_minor','collected_minor','supplier_paid_minor','net_cash_flow_minor','purchase_received_minor','purchase_returns_minor','current_stock_value_minor','current_receivables_minor','current_payables_minor']},'daily':[{'date':'2026-09-19','sales_minor':60000,'returns_minor':0}],'top_products':[]}
        elif path=='/rest/v1/rpc/si_mutate':
            self.calls.append(body);a=body['p_action'];p=body['p_payload'];key=body['p_key']
            if key in self.results:data=self.results[key]
            elif a=='product_save':data={**p,'id':p.get('id') or '88888888-8888-4888-8888-888888888888','org_id':ORG,'stock':0,'cost_minor':0,'created_at':now,'low_stock':True};self.products.append(data)
            elif a=='purchase_save':
                data=dict(id=PO,org_id=ORG,status='draft',reference='PO-TEST',total_minor=sum(l['quantity']*l['unit_cost_minor'] for l in p['lines']),paid_minor=p['paid_minor'],returned_minor=0,refunded_minor=0,created_at=now,notes=p['notes'],payment_method=p['payment_method'])
                self.purchases=[data];self.poitems=[dict(id='line-'+str(i),**l,product_name=next(x['name'] for x in self.products if x['id']==l['product_id']),sku='RICE-1',returned_quantity=0) for i,l in enumerate(p['lines'])]
            elif a=='purchase_receive':
                data=self.purchases[0];data['status']='received'
                for l in self.poitems:next(x for x in self.products if x['id']==l['product_id'])['stock']+=l['quantity']
            elif a=='sale_checkout':
                data=dict(id=SALE,org_id=ORG,status='completed',reference='SL-TEST',subtotal_minor=p['expected_total_minor'],discount_minor=p['discount_minor'],tax_minor=0,tax_bps=0,total_minor=p['expected_total_minor'],paid_minor=p['expected_total_minor'],change_minor=p['tendered_minor']-p['expected_total_minor'],returned_minor=0,refunded_minor=0,created_at=now,payment_method=p['payment_method'],receipt_snapshot=org,notes=p['notes'])
                self.sales=[data];self.items=[]
                for l in p['lines']:
                    prod=next(x for x in self.products if x['id']==l['product_id']);prod['stock']-=l['quantity'];self.items.append(dict(id='item-'+str(len(self.items)),**l,product_name=prod['name'],sku=prod['sku'],returned_quantity=0,unit_price_minor=prod['price_minor'],line_total_minor=l['quantity']*prod['price_minor']))
                self.results[key]=data
                if self.uncertain:self.uncertain=False;route.abort('failed');return
            else:data={'id':p.get('id',ORG),**p}
            self.results[key]=data
        else:raise AssertionError('Unexpected fixture request: '+path)
        count=len(data) if isinstance(data,list) else 0
        if isinstance(data,list):
            for k,v in q.items():
                if v[0].startswith('eq.') and k not in ['org_id','user_id','source_id','source_type','purchase_id','sale_id']:data=[x for x in data if str(x.get(k,'')).lower()==v[0][3:].lower()]
            count=len(data);offset=int(q.get('offset',['0'])[0]);limit=int(q.get('limit',['1000'])[0]);data=data[offset:offset+limit]
        route.fulfill(status=status,content_type='application/json',headers={'Access-Control-Allow-Origin':'*','Access-Control-Expose-Headers':'content-range','content-range':f'0-{max(0,count-1)}/{count}'},body=json.dumps(data))
def setup(page,fixture,logged=True):
    page.route(URL+'/**',fixture.handle)
    script=f"sessionStorage.setItem('si-public-config',JSON.stringify({json.dumps({'supabaseUrl':URL,'supabaseKey':KEY})}));"
    if logged:script+=f"sessionStorage.setItem('si-session:{URL}',JSON.stringify({json.dumps({'access_token':'fixture-token','refresh_token':'fixture-refresh','expires_at':int(time.time())+3600,'user':{'id':USER,'email':'owner@example.test'}})}));"
    page.add_init_script(script)
def go(page,name):page.evaluate('(name)=>location.hash=name',name);page.wait_for_selector('#main .page-heading h1')
def no_overflow(page):assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'Unexpected horizontal page overflow'
passes=[]
def passed(name):passes.append(name);print('PASS:',name,flush=True)
with sync_playwright() as p:
    browser=p.chromium.launch(**({'executable_path':os.environ['CHROMIUM_PATH']} if os.getenv('CHROMIUM_PATH') else {}),args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':1440,'height':1000});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(BASE);expect(page.get_by_role('heading',name='Connect to Supabase')).to_be_visible();page.get_by_label('Supabase project URL').fill(URL);page.get_by_label('Publishable key').fill('sb_secret_never_1234567890123456789');page.get_by_role('button',name='Connect workspace').click();expect(page.get_by_role('alert')).to_contain_text('Secret keys');passed('Unconfigured app is explicit; secret keys rejected')
    fixture=Fixture();setup(page,fixture,False);page.reload();expect(page.get_by_role('heading',name='Welcome back')).to_be_visible();page.get_by_label('Email address').fill('owner@example.test');page.get_by_label('Password',exact=True).fill('fixture-password');page.get_by_role('button',name='Sign in',exact=True).click();expect(page.get_by_role('heading',name='Overview',exact=True)).to_be_visible();page.screenshot(path=str(ART/'dashboard-desktop.png'),full_page=True);no_overflow(page);passed('Login, authenticated workspace and desktop dashboard')
    page.locator('.skip-link').focus();page.keyboard.press('Enter');assert page.evaluate('document.activeElement.id')=='main';assert '#main' not in page.url;passed('Keyboard skip link focuses main without changing route')
    for route_name,title in [('products','Products'),('categories','Categories'),('customers','Customers'),('suppliers','Suppliers'),('inventory','Stock movements'),('reports','Reports'),('settings','Settings'),('assistant','AI assistant')]:
        go(page,route_name);expect(page.get_by_role('heading',name=title,exact=True)).to_be_visible();no_overflow(page)
    passed('All management routes render without JavaScript errors')
    go(page,'products');page.get_by_role('button',name='Add product').click();d=page.locator('dialog');d.get_by_label('Name',exact=True).fill('<img src=x onerror=alert(1)>');d.get_by_label('SKU',exact=True).fill('XSS-TEST');d.get_by_label('Sell price').fill('12.50');d.get_by_role('button',name='Save changes').click();expect(page.locator('dialog')).to_have_count(0);assert fixture.calls[-1]['p_action']=='product_save';assert 'stock' not in fixture.calls[-1]['p_payload'];assert page.locator('img[src=x]').count()==0;passed('Product creation persists by RPC; rendered names are escaped')
    go(page,'purchases');page.get_by_role('button',name='New purchase').click();d=page.locator('dialog');d.get_by_label('Choose product').select_option(P1);d.get_by_role('button',name='Add to purchase').click();d.get_by_label('Quantity for Premium rice').fill('2');d.get_by_label('Unit cost for Premium rice').fill('200.00');d.get_by_role('button',name='Save draft').click();expect(page.locator('dialog')).to_have_count(0);assert fixture.calls[-1]['p_action']=='purchase_save';assert fixture.products[0]['stock']==10;passed('Purchase draft save does not receive stock')
    page.get_by_role('button',name='View details').click();page.get_by_role('button',name='Receive goods').click();page.locator('dialog').last.get_by_role('button',name='Receive goods').click();expect(page.locator('dialog')).to_have_count(0);assert fixture.products[0]['stock']==12;passed('Explicit receive is a separate backend command')
    go(page,'pos');expect(page.get_by_role('heading',name='Point of sale',exact=True)).to_be_visible();page.locator('[data-action=add][data-id="'+P1+'"]').click();page.get_by_role('button',name='Hold order',exact=True).click();assert len(fixture.calls)==3;page.get_by_role('button',name='Held orders (1)').click();page.get_by_role('button',name='Resume',exact=True).click();page.screenshot(path=str(ART/'pos-desktop.png'),full_page=True);passed('Held cart resumes without any stock write')
    page.locator('[data-action=checkout]').click();d=page.locator('dialog');d.get_by_label('Amount received').fill('500.00');d.locator('[type=submit]').evaluate('(button)=>{button.click();button.click();}');expect(page.locator('.receipt')).to_be_visible();assert len([c for c in fixture.calls if c['p_action']=='sale_checkout'])==1;assert fixture.products[0]['stock']==11;page.screenshot(path=str(ART/'receipt.png'));page.get_by_role('button',name='Close dialog').click();passed('Checkout suppresses duplicate submission and opens printable receipt')
    # Simulate a server commit followed by network loss: retry preserves the key.
    page.locator('[data-action=add][data-id="'+P2+'"]').click();fixture.uncertain=True;page.locator('[data-action=checkout]').click();page.get_by_role('button',name='Confirm and save sale').click();expect(page.get_by_role('alert')).to_contain_text('Cannot reach Supabase');page.get_by_role('button',name='Close dialog').click();page.get_by_role('button',name='Refresh records',exact=True).click();page.get_by_role('button',name='Resolve pending request').click();page.get_by_role('button',name='Retry original request').click();page.wait_for_timeout(500);calls=[c for c in fixture.calls if c['p_action']=='sale_checkout'];assert calls[-1]['p_key']==calls[-2]['p_key'];assert fixture.products[1]['stock']==1;assert page.evaluate(f"sessionStorage.getItem('si-cart:{URL}:{USER}:{ORG}')") is None;passed('Unknown checkout outcome resolves with same key and clears stale cart')
    page.evaluate('document.querySelectorAll("dialog").forEach(d=>d.close())')
    for width in [768,390,320]:
        page.set_viewport_size({'width':width,'height':900});go(page,'dashboard');expect(page.get_by_role('heading',name='Overview',exact=True)).to_be_visible();no_overflow(page);page.get_by_role('button',name='Open navigation').click();expect(page.locator('.sidebar')).to_have_class('sidebar open');page.get_by_role('link',name='Point of sale',exact=True).click();expect(page.get_by_role('heading',name='Point of sale',exact=True)).to_be_visible();no_overflow(page);page.screenshot(path=str(ART/f'pos-{width}.png'),full_page=True)
    passed('Tablet and mobile navigation and layout: 768, 390, 320 pixels')
    assert not errors,errors;passed('No uncaught browser errors across exercised journeys')
    page.close();page=browser.new_page();setup(page,Fixture('cashier'));page.goto(BASE+'/#reports');expect(page.get_by_role('heading',name='Access restricted')).to_be_visible();assert page.get_by_role('link',name='Settings',exact=True).count()==0;passed('Cashier management routes and navigation are restricted')
    browser.close()
(ART/'browser-results.json').write_text(json.dumps({'passed':len(passes),'tests':passes,'backend':'HTTP fixtures, not live Supabase'},indent=2))
print(f'{len(passes)} browser checks passed.')
