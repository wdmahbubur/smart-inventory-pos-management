-- Owner-scoped, snapshot-consistent read models. Never expose a caller-selected store.
alter table public.stores add column demo_clock timestamptz check(demo_clock is null or is_demo);

create function private.safe_json(v jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
declare result jsonb;
begin
 if jsonb_typeof(v)='object' then
  select coalesce(jsonb_object_agg(key,case when (key like '%\_paisa' escape '\' or key in ('data_revision','store_data_revision','sequence')) and jsonb_typeof(value)='number' then to_jsonb(value#>>'{}') else private.safe_json(value) end),'{}'::jsonb) into result from jsonb_each(v);
 elsif jsonb_typeof(v)='array' then
  select coalesce(jsonb_agg(private.safe_json(value) order by ordinality),'[]'::jsonb) into result from jsonb_array_elements(v) with ordinality;
 else result:=v; end if;
 return result;
end $$;
create function private.business_clock(sid uuid) returns timestamptz language sql stable set search_path='' as $$
 select case when is_demo then coalesce(demo_clock,statement_timestamp()) else statement_timestamp() end from public.stores where id=sid
$$;
create function private.validate_filters(f jsonb) returns void language plpgsql immutable set search_path='' as $$
declare d1 date; d2 date;
begin
 perform private.keys(f,array[]::text[],array['q','page','size','sort','category','stock','archived','status','from','to','supplier','product','document']);
 perform private.text_value(f,'q',0,150);
 if f ? 'page' then perform private.int_value(f,'page',1,1000000); end if;
 if f ? 'size' and private.int_value(f,'size',20,100) not in (20,50,100) then perform private.fail('VALIDATION_ERROR'); end if;
 if f ? 'archived' and jsonb_typeof(f->'archived')<>'boolean' then perform private.fail('VALIDATION_ERROR'); end if;
 if f ? 'sort' and f->>'sort' not in ('name_asc','name_desc','stock_asc','stock_desc','price_asc','price_desc','newest') then perform private.fail('VALIDATION_ERROR'); end if;
 if f ? 'stock' and f->>'stock' not in ('','in_stock','low_stock','out_of_stock','attention') then perform private.fail('VALIDATION_ERROR'); end if;
 if f ? 'status' and f->>'status' not in ('','draft','received','completed','purchase','sale') then perform private.fail('VALIDATION_ERROR'); end if;
 if (f ? 'from')<>(f ? 'to') then perform private.fail('VALIDATION_ERROR'); end if;
 if f ? 'from' then
  if f->>'from' !~ '^\d{4}-\d{2}-\d{2}$' or f->>'to' !~ '^\d{4}-\d{2}-\d{2}$' then perform private.fail('VALIDATION_ERROR'); end if;
  d1:=(f->>'from')::date; d2:=(f->>'to')::date;
  if d1 is null or d2 is null or d2<d1 or d2-d1>365 then perform private.fail('DATE_RANGE_LIMIT'); end if;
 end if;
end $$;
create function public.list_catalog(p_kind text,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); result jsonb; lim integer:=coalesce((p_filters->>'size')::integer,20); offst integer:=(coalesce((p_filters->>'page')::integer,1)-1)*lim; q text:=lower(coalesce(p_filters->>'q','')); sort_by text:=coalesce(p_filters->>'sort','name_asc');
begin
 perform private.validate_filters(p_filters);
 if p_kind='products' then
  with records as (
   select p.*,c.name category_name,b.quantity,
    case when b.quantity=0 then 'out_of_stock' when b.quantity<p.minimum_stock then 'low_stock' else 'in_stock' end stock_status,
    b.quantity::numeric*p.reference_cost_paisa stock_value_paisa,
    exists(select 1 from public.purchase_items i where i.store_id=sid and i.product_id=p.id) or exists(select 1 from public.sale_items i where i.store_id=sid and i.product_id=p.id) referenced
   from public.products p join public.inventory_balances b on b.product_id=p.id and b.store_id=p.store_id join public.categories c on c.id=p.category_id and c.store_id=p.store_id
   where p.store_id=sid and (p.archived_at is not null)=coalesce((p_filters->>'archived')::boolean,false)
    and (q='' or position(q in lower(p.name||' '||p.sku))>0) and (nullif(p_filters->>'category','') is null or p.category_id=(p_filters->>'category')::uuid)
  ), filtered as (select * from records where coalesce(p_filters->>'stock','')='' or stock_status=p_filters->>'stock' or (p_filters->>'stock'='attention' and stock_status<>'in_stock')),
  page as (select * from filtered order by
   case when sort_by='name_asc' then lower(name) end asc,case when sort_by='name_desc' then lower(name) end desc,
   case when sort_by='stock_asc' then quantity end asc,case when sort_by='stock_desc' then quantity end desc,
   case when sort_by='price_asc' then selling_price_paisa end asc,case when sort_by='price_desc' then selling_price_paisa end desc,
   case when sort_by='newest' then created_at end desc,id limit lim offset offst)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'filtered_value_paisa',(select coalesce(sum(stock_value_paisa),0)::text from filtered),'page',offst/lim+1,'size',lim) into result;
 elsif p_kind='categories' then
  with counts as (select category_id,count(*) product_count from public.products where store_id=sid group by category_id),filtered as (
   select c.*,coalesce(n.product_count,0) product_count from public.categories c left join counts n on n.category_id=c.id where c.store_id=sid and (q='' or position(q in lower(c.name))>0)
  ), page as (select * from filtered order by case when sort_by='name_desc' then lower(name) end desc,case when sort_by<>'name_desc' then lower(name) end asc,id limit lim offset offst)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'page',offst/lim+1,'size',lim) into result;
 elsif p_kind='suppliers' then
  with totals as (select supplier_id,count(*) received_count,sum(total_paisa) received_total_paisa from public.purchases where store_id=sid and status='received' group by supplier_id),filtered as (
   select s.*,coalesce(t.received_count,0) received_count,coalesce(t.received_total_paisa,0) received_total_paisa from public.suppliers s left join totals t on t.supplier_id=s.id
   where s.store_id=sid and (s.archived_at is not null)=coalesce((p_filters->>'archived')::boolean,false) and (q='' or position(q in lower(s.name||' '||coalesce(s.phone,'')))>0)
  ),page as (select * from filtered order by case when sort_by='name_desc' then lower(name) end desc,case when sort_by<>'name_desc' then lower(name) end asc,id limit lim offset offst)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'received_count',(select coalesce(sum(received_count),0) from filtered),'received_total_paisa',(select coalesce(sum(received_total_paisa),0)::text from filtered),'page',offst/lim+1,'size',lim) into result;
 else perform private.fail('VALIDATION_ERROR'); end if;
 return private.safe_json(result);
end $$;

create function public.get_workspace() returns jsonb language sql stable security definer set search_path='' as $$
 with ctx as (select s.*,private.business_clock(s.id) snapshot_at from public.stores s where s.id=private.store_id()),
 bounds as (select (snapshot_at at time zone 'Asia/Dhaka')::date business_date,((snapshot_at at time zone 'Asia/Dhaka')::date::timestamp at time zone 'Asia/Dhaka') start_at from ctx),
 catalog as (select p.id,p.name,p.sku,p.unit,p.minimum_stock,p.icon_key,p.color_key,c.id category_id,c.name category_name,b.quantity,b.quantity::numeric*p.reference_cost_paisa stock_value_paisa,
 case when b.quantity=0 then 'out_of_stock' when b.quantity<p.minimum_stock then 'low_stock' else 'in_stock' end stock_status,greatest(p.minimum_stock-b.quantity,0) shortage
 from public.products p join public.inventory_balances b on b.product_id=p.id join public.categories c on c.id=p.category_id where p.store_id=(select id from ctx) and p.archived_at is null),
 sale_docs as (select s.* from public.sales s,bounds b where s.store_id=(select id from ctx) and s.completed_at>=b.start_at and s.completed_at<b.start_at+interval '1 day'),
 purchase_docs as (select p.* from public.purchases p,bounds b where p.store_id=(select id from ctx) and p.status='received' and p.received_at>=b.start_at and p.received_at<b.start_at+interval '1 day'),
 category_values as (select category_id id,category_name name,sum(stock_value_paisa) value_paisa,count(*) product_count from catalog group by category_id,category_name),
 ordered_categories as (select *,row_number() over(order by value_paisa desc,name,id) rank from category_values),
 chart_categories as (select id::text id,name,value_paisa,product_count from ordered_categories where rank<=20 union all select 'others','Others',sum(value_paisa),sum(product_count) from ordered_categories where rank>20 having count(*)>0),
 attention as (select * from catalog where stock_status<>'in_stock' order by (quantity=0) desc,lower(name),id limit 20),
 recent as (select id,number,'sale' kind,total_paisa,completed_at activity_at,coalesce(customer_name,'Walk-in customer') detail from public.sales where store_id=(select id from ctx) union all select id,number,'purchase',total_paisa,received_at,supplier_name_snapshot from public.purchases where store_id=(select id from ctx) and status='received'),
 recent_page as (select * from recent order by activity_at desc,id desc limit 5)
 select private.safe_json(jsonb_build_object(
 'store',(select to_jsonb(ctx)-'next_purchase_number'-'next_sale_number'-'demo_clock' from ctx),
 'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
 'snapshot_at',(select snapshot_at from ctx),'business_date',(select business_date from bounds),'data_revision',(select data_revision::text from ctx),
 'inventory',jsonb_build_object('active_count',(select count(*) from catalog),'category_count',(select count(distinct category_id) from catalog),'in_stock',(select count(*) from catalog where stock_status='in_stock'),'low_stock',(select count(*) from catalog where stock_status='low_stock'),'out_of_stock',(select count(*) from catalog where stock_status='out_of_stock'),'attention_count',(select count(*) from catalog where stock_status<>'in_stock'),'units',(select coalesce(sum(quantity),0) from catalog),'value_paisa',(select coalesce(sum(stock_value_paisa),0)::text from catalog)),
 'sales',jsonb_build_object('count',(select count(*) from sale_docs),'total_paisa',(select coalesce(sum(total_paisa),0)::text from sale_docs),'discount_paisa',(select coalesce(sum(discount_paisa),0)::text from sale_docs),'units',(select coalesce(sum(i.quantity),0) from public.sale_items i join sale_docs d on d.id=i.sale_id)),
 'purchases',jsonb_build_object('count',(select count(*) from purchase_docs),'total_paisa',(select coalesce(sum(total_paisa),0)::text from purchase_docs),'units',(select coalesce(sum(i.quantity),0) from public.purchase_items i join purchase_docs d on d.id=i.purchase_id)),
 'attention',coalesce((select jsonb_agg(to_jsonb(attention)) from attention),'[]'),'attention_truncated',(select count(*)>20 from catalog where stock_status<>'in_stock'),
 'categories',coalesce((select jsonb_agg(to_jsonb(chart_categories) order by value_paisa desc,name) from chart_categories),'[]'),
 'highest_category',(select to_jsonb(category_values) from category_values order by value_paisa desc,name,id limit 1),
 'recent',coalesce((select jsonb_agg(to_jsonb(recent_page)) from recent_page),'[]')))
$$;

create function public.get_entity(p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); result jsonb;
begin
 if p_kind='products' then
  select to_jsonb(p)||jsonb_build_object('quantity',b.quantity,'category_name',c.name,'referenced',exists(select 1 from public.purchase_items where product_id=p.id) or exists(select 1 from public.sale_items where product_id=p.id)) into result from public.products p join public.inventory_balances b on b.product_id=p.id join public.categories c on c.id=p.category_id where p.store_id=sid and p.id=p_id;
 elsif p_kind='categories' then select to_jsonb(c) into result from public.categories c where store_id=sid and id=p_id;
 elsif p_kind='suppliers' then select to_jsonb(s) into result from public.suppliers s where store_id=sid and id=p_id;
 elsif p_kind='purchases' then
  select to_jsonb(p)||jsonb_build_object('supplier_name',s.name,'items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('name',pr.name,'sku',pr.sku,'unit',pr.unit,'icon_key',pr.icon_key,'color_key',pr.color_key,'quantity_available',b.quantity) order by i.line_position) from public.purchase_items i join public.products pr on pr.id=i.product_id join public.inventory_balances b on b.product_id=i.product_id where i.store_id=sid and i.purchase_id=p.id),'[]'),
  'movements',coalesce((select jsonb_agg(to_jsonb(m)||jsonb_build_object('product_name',i.product_name_snapshot) order by i.line_position) from public.stock_movements m join public.purchase_items i on i.id=m.purchase_item_id where m.store_id=sid and i.purchase_id=p.id),'[]')) into result
  from public.purchases p join public.suppliers s on s.id=p.supplier_id where p.store_id=sid and p.id=p_id;
 elsif p_kind='sales' then
  select to_jsonb(s)||jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(i) order by i.line_position) from public.sale_items i where i.store_id=sid and i.sale_id=s.id),'[]')) into result from public.sales s where s.store_id=sid and s.id=p_id;
 else perform private.fail('VALIDATION_ERROR'); end if;
 if result is null then perform private.fail('NOT_FOUND'); end if;
 return private.safe_json(result);
end $$;
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.list_catalog(text,jsonb),public.get_workspace(),public.get_entity(text,uuid) from public,anon;
grant execute on function public.list_catalog(text,jsonb),public.get_workspace(),public.get_entity(text,uuid) to authenticated;
