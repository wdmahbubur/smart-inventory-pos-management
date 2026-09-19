import {escapeHtml as e,toMinor,decimal,quantity,cleanText} from './core.js';
import {icon,heading,button,badge,table,empty,field,select,area,modal,bindActions,formSubmit,pager,searchForm,safeSearch,downloadCsv,toast} from './ui.js';
export async function render(app,node){
  const route=app.route,products=route==='products',categories=route==='categories',inventory=route==='inventory',kind=route==='suppliers'?'supplier':'customer';
  const title=products?'Products':categories?'Categories':inventory?'Stock movements':kind==='supplier'?'Suppliers':'Customers';
  const tableName=products?'si_products':categories?'si_categories':inventory?'si_stock_movements':'si_contacts';
  const description=products?'A clear view of every product, price, and unit on your shelves.':categories?'Keep your catalog organized and easy to browse.':inventory?'An immutable history of every change to your stock.':`Manage your ${kind} relationships in one place.`;
  const cats=products?(await app.lookup('si_categories')):[];let page=0,query='',status='active',category='',rows=[],count=0;
  const canEdit=!inventory&&(app.manager()||kind==='customer'&&!products&&!categories);
  async function load(){
    const filters={order:inventory?'created_at.desc':products?'name.asc,id.asc':'name.asc',limit:20,offset:page*20};
    if(!inventory){filters.active=`eq.${status!=='archived'}`;if(query)filters[products?'search_text':'name']=`ilike.*${safeSearch(query).toLowerCase()}*`;}
    else if(status!=='active')filters.kind=`eq.${status}`;
    if(products&&category)filters.category_id=`eq.${category}`;
    if(products&&status==='low')filters.low_stock='eq.true';
    if(!products&&!categories&&!inventory)filters.kind=`eq.${kind}`;
    const result=await app.select(tableName,filters);rows=result.data;count=result.count;
    const options=inventory?[['active','All movements'],['purchase','Purchases'],['sale','Sales'],['adjustment','Adjustments'],['sale_return','Sale returns'],['purchase_return','Purchase returns']]:[['active','Active'],['archived','Archived'],...(products?[['low','Low stock']]:[])];
    const listExtra=`<select name="status" aria-label="Filter status">${options.map(([v,l])=>`<option value="${v}" ${v===status?'selected':''}>${l}</option>`).join('')}</select>${products?`<select name="category" aria-label="Filter category"><option value="">All categories</option>${cats.map(c=>`<option value="${c.id}" ${c.id===category?'selected':''}>${e(c.name)}</option>`).join('')}</select>`:''}`;
    node.innerHTML=heading(title,description,`${button('Export page','export','secondary','download')}${canEdit?button(`Add ${products?'product':categories?'category':kind}`,'add','primary','plus'):''}`)+`<section class="panel">${inventory?`<form class="toolbar" data-filter>${listExtra}<button class="button secondary" type="submit">Apply filter</button></form>`:searchForm(products?'Search product name, SKU or barcode':`Search ${title.toLowerCase()}`,listExtra)}${rows.length?table(headers(),rows.map(row)):empty(`No ${title.toLowerCase()} found`,query?'Try a different search or filter.':inventory?'Stock changes appear here after receiving, selling, returning, or adjusting products.':`Add your first ${products?'product':categories?'category':kind} to get started.`)}${pager(page,count)}</section>${products?'<p class="footer-note">New products start with zero stock. Receive a purchase or record an audited adjustment to change quantities. Cost uses a moving weighted average.</p>':''}`;
    const form=node.querySelector('[data-filter]');if(form.elements.search)form.elements.search.value=query;
    formSubmit(form,async(data)=>{query=data.search||'';status=data.status;category=data.category||'';page=0;await load();});
    node.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>{page=Number(b.dataset.page);load().catch(err=>toast(err.message,'error'));});
    bindActions(node,{add:()=>edit(),edit:b=>edit(rows.find(r=>r.id===b.dataset.id)),adjust:b=>adjust(rows.find(r=>r.id===b.dataset.id)),export:()=>downloadCsv(`${route}-page-${page+1}.csv`,rows,columns())});
  }
  function headers(){return products?['Product','Category','Sell price','Average cost','Stock','Status','Actions']:categories?['Category','Status','Actions']:inventory?['Date','Product ID','Movement','Change','Balance','Reason']:['Name','Email','Phone','Address','Status','Actions'];}
  function row(r){
    if(products)return `<tr><td><div class="cell-product"><span class="product-icon">${icon('cube')}</span><div><strong>${e(r.name)}</strong><small>${e(r.sku)}${r.barcode?' · '+e(r.barcode):''}</small></div></div></td><td>${e(cats.find(c=>c.id===r.category_id)?.name||'Uncategorized')}</td><td>${e(app.money(r.price_minor))}</td><td>${e(app.money(r.cost_minor))}</td><td>${badge(`${r.stock} ${r.unit}`,r.low_stock?'amber':'green')}</td><td>${badge(r.active?'Active':'Archived',r.active?'green':'gray')}</td><td>${app.manager()?`<div class="actions"><button class="icon-button" data-action="edit" data-id="${r.id}" aria-label="Edit ${e(r.name)}">${icon('edit')}</button><button class="icon-button" data-action="adjust" data-id="${r.id}" aria-label="Adjust stock for ${e(r.name)}">${icon('refresh')}</button></div>`:'—'}</td></tr>`;
    if(categories)return `<tr><td><strong>${e(r.name)}</strong></td><td>${badge(r.active?'Active':'Archived',r.active?'green':'gray')}</td><td><button class="icon-button" data-action="edit" data-id="${r.id}" aria-label="Edit ${e(r.name)}">${icon('edit')}</button></td></tr>`;
    if(inventory)return `<tr><td>${e(app.date(r.created_at,true))}</td><td title="${r.product_id}">${e(r.product_id.slice(0,8))}…</td><td>${badge(r.kind)}</td><td><strong>${r.delta>0?'+':''}${r.delta}</strong></td><td>${r.balance_after}</td><td>${e(r.reason||'—')}</td></tr>`;
    return `<tr><td><strong>${e(r.name)}</strong></td><td>${e(r.email||'—')}</td><td>${e(r.phone||'—')}</td><td>${e(r.address||'—')}</td><td>${badge(r.active?'Active':'Archived',r.active?'green':'gray')}</td><td><button class="icon-button" data-action="edit" data-id="${r.id}" aria-label="Edit ${e(r.name)}">${icon('edit')}</button></td></tr>`;
  }
  function columns(){return inventory?['created_at','product_id','kind','delta','balance_after','reason'].map(key=>({key,label:key})):products?[{key:'name',label:'Product'},{key:'sku',label:'SKU'},{key:'barcode',label:'Barcode'},{key:'stock',label:'Stock'},{key:'unit',label:'Unit'},{label:'Price',value:r=>decimal(r.price_minor)},{label:'Average cost',value:r=>decimal(r.cost_minor)},{key:'active',label:'Active'}]:[{key:'name',label:'Name'},...(!categories?['email','phone','address'].map(key=>({key,label:key})):[]),{key:'active',label:'Active'}];}
  function edit(r={}){
    let body=field('name','Name',r.name||'','text',`required maxlength="${categories?80:160}"`);
    if(products)body+=`<div class="form-grid">${field('sku','SKU',r.sku||'','text','required maxlength="80"')}${field('barcode','Barcode (optional)',r.barcode||'','text','maxlength="80"')}</div><div class="form-grid">${select('category_id','Category',[['','Uncategorized'],...cats.map(c=>[c.id,c.name])],r.category_id||'')}${field('unit','Unit',r.unit||'pcs','text','required maxlength="20"')}</div><div class="form-grid">${field('price','Sell price',decimal(r.price_minor),'text','required inputmode="decimal"')}${field('reorder_level','Reorder level',r.reorder_level??5,'number','required min="0" max="1000000" step="1"')}</div><div class="notice">Stock and average cost cannot be changed in this form. Receive goods through Purchases to establish their cost.</div>`;
    else if(!categories)body+=`<div class="form-grid">${field('email','Email',r.email||'','email','maxlength="254"')}${field('phone','Phone',r.phone||'','tel','maxlength="60"')}</div>${area('address','Address',r.address||'','maxlength="500"')}`;
    body+=select('active','Status',[['true','Active'],['false','Archived']],String(r.active??true));
    modal(`${r.id?'Edit':'Add'} ${products?'product':categories?'category':kind}`,body,{submit:'Save changes',onSubmit:async(data,_,dialog)=>{
      let payload={id:r.id||null,name:cleanText(data.name,'Name',categories?80:160),active:data.active==='true'};
      if(products)payload={...payload,sku:cleanText(data.sku,'SKU',80),barcode:data.barcode,unit:cleanText(data.unit,'Unit',20),category_id:data.category_id||null,price_minor:toMinor(data.price),reorder_level:quantity(data.reorder_level,true)};
      else if(!categories)payload={...payload,kind,email:data.email,phone:data.phone,address:data.address};
      await app.mutate(products?'product_save':categories?'category_save':'contact_save',payload);dialog.close();toast('Changes saved to Supabase.');await load();
    }});
  }
  function adjust(r){if(!r.active)throw new Error('Activate this product before adjusting stock.');modal(`Adjust ${r.name}`,`<div class="notice">Current stock: ${r.stock} ${e(r.unit)}. Use Purchases for received goods; adjustments are for counted discrepancies or write-offs.</div><div class="form-grid">${select('direction','Adjustment',[['1','Add stock'],['-1','Remove stock']])}${field('quantity','Quantity',1,'number','required min="1" max="1000000" step="1"')}</div>${area('reason','Reason','','required minlength="3" maxlength="2000"')}`,{submit:'Record adjustment',onSubmit:async(data,_,dialog)=>{await app.mutate('stock_adjust',{id:r.id,delta:Number(data.direction)*quantity(data.quantity),reason:cleanText(data.reason,'Reason',2000)});dialog.close();toast('Stock adjustment recorded.');await load();}});}
  await load();
}
