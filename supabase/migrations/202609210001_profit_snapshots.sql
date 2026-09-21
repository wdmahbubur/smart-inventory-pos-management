-- User-requested sales-profit reporting.
-- Profit basis: net sales minus the product reference cost captured at sale completion.
-- This is a sales-margin metric before operating expenses; it is not FIFO/weighted-average accounting profit.
-- Existing sale rows predate cost snapshots, so they are backfilled once from each product's current reference cost.

alter table public.sale_items add column unit_cost_paisa bigint;
alter table public.sale_items add column line_cost_paisa bigint;

alter table public.sale_items disable trigger immutable_sale_items;
update public.sale_items i
set unit_cost_paisa=p.reference_cost_paisa,
    line_cost_paisa=i.quantity::bigint*p.reference_cost_paisa
from public.products p
where p.store_id=i.store_id and p.id=i.product_id;
alter table public.sale_items enable trigger immutable_sale_items;

alter table public.sale_items alter column unit_cost_paisa set not null;
alter table public.sale_items alter column line_cost_paisa set not null;
alter table public.sale_items add constraint sale_items_unit_cost_range check(unit_cost_paisa between 0 and 1000000000);
alter table public.sale_items add constraint sale_items_line_cost_matches check(line_cost_paisa=quantity::bigint*unit_cost_paisa and line_cost_paisa<=1000000000000);

create or replace function public.complete_sale(p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.stores:=private.store_lock(); replay jsonb; line jsonb; product public.products; before_qty integer; qty integer;
 subtotal numeric:=0; discount bigint; tender bigint; total bigint; sale_id uuid; item_id uuid; pos integer:=0;
 stamp timestamptz; document_number text; cashier text; result jsonb;
begin
 replay:=private.replay(s.id,'complete_sale',p_request_id,p_payload); if replay is not null then return replay; end if;
 perform private.keys(p_payload,array['items','discount_paisa','cash_received_paisa'],array['items','discount_paisa','cash_received_paisa','customer_name','customer_phone']);
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then perform private.fail('VALIDATION_ERROR'); end if;
 if (select count(distinct value->>'product_id') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') then perform private.fail('VALIDATION_ERROR'); end if;
 for line in select value from jsonb_array_elements(p_payload->'items') order by (value->>'product_id')::uuid loop
  perform private.keys(line,array['product_id','quantity','expected_price_paisa','expected_version'],array['product_id','quantity','expected_price_paisa','expected_version']);
  select * into product from public.products where store_id=s.id and id=(line->>'product_id')::uuid and archived_at is null for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  qty:=private.int_value(line,'quantity',1,1000000)::integer;
  if product.selling_price_paisa<>private.int_value(line,'expected_price_paisa',1,1000000000) or product.version<>private.int_value(line,'expected_version',1,2147483647) then
   raise exception using message='PRICE_CHANGED',errcode='P0001',detail=jsonb_build_object('product_id',product.id,'price_paisa',product.selling_price_paisa::text,'version',product.version)::text;
  end if;
  select quantity into before_qty from public.inventory_balances where store_id=s.id and product_id=product.id for update;
  if before_qty is null then perform private.fail('LEDGER_MISMATCH'); end if;
  if before_qty<qty then raise exception using message='INSUFFICIENT_STOCK',errcode='P0001',detail=jsonb_build_object('product_id',product.id,'available',before_qty)::text; end if;
  subtotal:=subtotal+qty::numeric*product.selling_price_paisa;
  if subtotal>1000000000000 then perform private.fail('VALIDATION_ERROR'); end if;
 end loop;
 discount:=private.int_value(p_payload,'discount_paisa',0,1000000000000);
 tender:=private.int_value(p_payload,'cash_received_paisa',0,1000000000000);
 if discount>=subtotal then perform private.fail('INVALID_DISCOUNT'); end if;
 total:=subtotal::bigint-discount;
 if tender<total then perform private.fail('INSUFFICIENT_CASH'); end if;
 stamp:=clock_timestamp();
 document_number:='S-'||lpad(s.next_sale_number::text,greatest(4,length(s.next_sale_number::text)),'0');
 update public.stores set next_sale_number=next_sale_number+1 where id=s.id;
 select display_name into cashier from public.profiles where id=auth.uid();
 insert into public.sales(store_id,number,subtotal_paisa,discount_paisa,total_paisa,cash_received_paisa,change_paisa,customer_name,customer_phone,store_name_snapshot,store_phone_snapshot,store_address_snapshot,cashier_id,cashier_name_snapshot,completed_at,created_at)
 values(s.id,document_number,subtotal::bigint,discount,total,tender,tender-total,private.text_value(p_payload,'customer_name',0,150),private.text_value(p_payload,'customer_phone',0,32),s.name,s.phone,s.address,auth.uid(),cashier,stamp,stamp) returning id into sale_id;
 for line in select value from jsonb_array_elements(p_payload->'items') loop
  pos:=pos+1; qty:=(line->>'quantity')::integer;
  select * into product from public.products where store_id=s.id and id=(line->>'product_id')::uuid;
  insert into public.sale_items(store_id,sale_id,product_id,line_position,quantity,unit_price_paisa,line_gross_paisa,unit_cost_paisa,line_cost_paisa,product_name_snapshot,sku_snapshot,unit_snapshot)
  values(s.id,sale_id,product.id,pos,qty,product.selling_price_paisa,qty::bigint*product.selling_price_paisa,product.reference_cost_paisa,qty::bigint*product.reference_cost_paisa,product.name,product.sku,product.unit) returning id into item_id;
  select quantity into before_qty from public.inventory_balances where product_id=product.id;
  update public.inventory_balances set quantity=quantity-qty,updated_at=stamp where product_id=product.id;
  insert into public.stock_movements(store_id,product_id,source_type,sale_item_id,quantity_delta,quantity_before,quantity_after,created_by,created_at)
  values(s.id,product.id,'sale',item_id,-qty,before_qty,before_qty-qty,auth.uid(),stamp);
 end loop;
 result:=jsonb_build_object('id',sale_id,'number',document_number,'total_paisa',total::text,'change_paisa',(tender-total)::text);
 return private.finish(s.id,'complete_sale',p_request_id,p_payload,result);
end $$;

create or replace function public.get_workspace() returns jsonb language sql stable security definer set search_path='' as $$
 with ctx as (select s.*,private.business_clock(s.id) snapshot_at from public.stores s where s.id=private.store_id()),
 bounds as (select (snapshot_at at time zone 'Asia/Dhaka')::date business_date,((snapshot_at at time zone 'Asia/Dhaka')::date::timestamp at time zone 'Asia/Dhaka') start_at from ctx),
 catalog as (select p.id,p.name,p.sku,p.unit,p.minimum_stock,p.icon_key,p.color_key,c.id category_id,c.name category_name,b.quantity,b.quantity::numeric*p.reference_cost_paisa stock_value_paisa,
 case when b.quantity=0 then 'out_of_stock' when b.quantity<p.minimum_stock then 'low_stock' else 'in_stock' end stock_status,greatest(p.minimum_stock-b.quantity,0) shortage
 from public.products p join public.inventory_balances b on b.product_id=p.id join public.categories c on c.id=p.category_id where p.store_id=(select id from ctx) and p.archived_at is null),
 sale_docs as (select s.* from public.sales s,bounds b where s.store_id=(select id from ctx) and s.completed_at>=b.start_at and s.completed_at<b.start_at),
 purchase_docs as (select p.* from public.purchases p,bounds b where p.store_id=(select id from ctx) and p.status='received' and p.received_at>=b.start_at and p.received_at<b.start_at),
 attention as (select * from catalog where stock_status<>'in_stock' order by (quantity<>0) desc,lower(name),id),
 category_value as (select category_id id,max(category_name) name,sum(stock_value_paisa) value_paisa,count(*) product_count from catalog group by category_id),
 recent as (
  select s._id id,s.number,'sale'::text kind,s.total_paisa,s.completed_at activity_at,coalesce(sum(si.quantity),0)::text||' units × '||count(si.id)::text||' Products' detail from sale_docs s left join public.sale_items si on si.sale_id=s.id group by s.id,s.number,s.total_paisa,s.completed_at
  union all
  select p.id,p.number,'purchase',p.total_paisa,p.received_at,coalesce(sum(pi.quantity),0)::text||' units × '||count(pi.id)::text||' Products' from purchase_docs p left join public.purchase_items pi on pi.id=pid group by p.id,p.number,p.total_paisa,p.received_at
 )
 select jsonb_build_object(
 'store',(select to_jsonb(s)-'next_purchase_number'-'next_sale_number' from ctx s),
 'profile',(select to_jsonb(p) from public.profiles p where id=auth.uid()),
 'snapshot_at',(select snapshot_at from ctx),'business_date',(select business_date from bounds),'data_revision',(select data_revision::text from ctx),
 'inventory',jsonb_build_object('active_count',(select count(*) from catalog),'category_count',(select count(distinct category_id) from catalog),'in_stock',(select count() from catalog where stock_status='in_stock'),'low_stock',(select count() from catalog where stock_status='low_stock'),'out_of_stock',(select count(*) from catalog where stock_status='out_of_stock'),'attention_count',(select count() from catalog where stock_status<>'in_stock'),'units',(select coalesce(sum(quantity),0) from catalog),'value_paisa',(select coalesce(sum(stock_value_paisa),0)::text from catalog),
 'sales',jsonb_build_object('count',(select count(*) from sale_docs),'total_paisa',(select coalesce(sum(total_paisa),0)::text from sale_docs),'units',(select coalesce(sum(quantity),0) from public.sale_items i where i.sale_id in (select id from sale_docs)),'cogs_paisa',(select coalesce(sum(line_cost_paisa),0)::text from public.sale_items i where i.sale_id in (select id from sale_docs)),'net_profit_paisa',((select coalesce(sum(total_paisa),0) from sale_docs)-(select coalesce(sum(line_cost_paisa),0) from public.sale_items i where i.sale_id in (select id from sale_docs)))::text),
 'purchases',jsonb_build_object('count',(select count(*) from purchase_docs),'total_paisa',(select coalesce(sum(total_paisa),0)::text from purchase_docs),'units',(select coalesce(sum(quantity),0) from public.purchase_items i where i.purchase_id in (select id from purchase_docs)),
 'attention',coalesce((select jsonb_agg(to_jsonb(a) order by (a.quantity<>0) desc,lower(a.name),a.id) from (select * from attention limit 20) a),'[]'),'attention_truncated',(select count(*)>20 from attention),
 'categories',coalesce((select jsonb_agg(to_jsonb(c) - 'rn' order by c.\"value_paisa\" desc,c.id) from (select *,row_number() over(order by value_paisa desc,id) rn from category_value limit 10) c),'[]'),'highest_category',(select to_jsonb(c)-'product_count' from category_value c order by value_paisa desc,id limit 1),
 'recent',coalesce((select jsonb_agg(to_jsonb(r) order by r.activity_at desc,r.id desc) from (select * from recent order by activity_at desc,id desc limit 6) r),'[]')
 ) from ctx;
$$;

create or replace function public.get_report(p_kind text,p_filters jsob default '{}',p_export boolean default false) returns jsonb language plpgsql stable security definer set search_path='' set plan_cache_mode=force_custom_plan as $$
declare
 sid uuid:=private.store_id(); f jsonb:=coalesce(p_filters,'{}'); result jsob; ws jsob; listing jsonb;
 day date:=private.business_clock(sid) at time zone 'Asia/Dhaka'; first_day date; last_day date; start_at timestamptz; end_at timestamptz;
 lim integer:=coalesce((f->>'size')::integer,20); offst integer:=(coalesce((f->>'page')::integer,1)-1)*lim;
begin
 perform private.validate_filters(f);
 if p_kind='inventory' then
  if f ? 'from' or f ? 'to' or coalesce((f->>'archived')::boolean,false) then perform private.fail('VALIDATION_ERROR'); end if;
  ws:=public.get_workspace(); listing:=public.list_catalog('products',f);
  with records as (
   select p.id,p.name,p.sku,p.unit,c.name category_name,b.quantity,p.minimum_stock,p.reference_cost_paisa,b.quantity::numeric*p.reference_cost_paisa stock_value_paisa,case when b.quantity=0 then 'out_of_stock' when b.quantity<p.minimum_stock then 'low_stock' else 'in_stock' end stock_status
   from public.products p ioin public.inventory_balances b on b.product_id=p.id join public.categories c on c.id=p.category_id where p.store_id=sid and p.archived_at is null
   and (coalesce(f->>'q','')='' or position(lower(f->>'q') in lower(p.name||' '||p.sku))>0) and (nullif(f->>'category','') is null or p.category_id=(f->>'category')::uuid)
  ),filtered as (select * from records where coalesce(f->>'stock','')='' or stock_status=f->>'stock' or f->>'stock'='attention' and stock_status<>'pin_stock'),export_page as (select * from filtered order by lower(name),id limit 100001)
  select jsonb_build_object('kind',p_kind,'snapshot_at',ws->'snapshot_at','business_date',day,'summary',ws->'inventory','chart',ws->'categories','rows',listing->'rows','total',listing->'total','filtered_value_paisa',listing->'filtered_value_paisa','page',offset/lim+1,'size',lim,'source_count',(select count() from filtered),'source_rows',case when p_export then coalesce((select jsonb_agg(to_jsonb(export_page)) from export_page),'[]') else '[]'::jsonb end) into result;
 else
  first_day:=coalesce((f->>'from')::date,day); last_day:=coalesce((f->>'to')::date,day);
  f:=f||jsonb_build_object('from',first_day,'to',last_day); perform private.validate_filters(f);
  start_at:=first_day::timestamp at time zone 'Asia/Dhaka'; end_at:=(last_day+1)::timestamp at time zone 'Asia/Dhaka';
  if p_kind='sales' then
   with docs as (select * from public.sales where store_id=sid and completed_at>=start_at and completed_at<end_at),lines as (
    select i.*,s.number,s.completed_at,s.discount_paisa,s.total_paisa sale_total_paisa,row_number() over(partition by i.sale_id order by i.line_position,i.id) export_line
    from public.sale_items i join docs s on s.id=i.sale_id where i.store_id=sid
   ),groups as (select product_id id,(array_agg(product_name_snapshot order by completed_at desc,sale_id desc,line_position))[1] name,(array_agg(sku_snapshot order by completed_at desc,sale_id desc,line_position))[1] sku,sum(quantity) quantity,sum(line_gross_paisa) gross_paisa,sum(line_cost_paisa) cost_paisa,sum(line_gross_paisa-line_cost_paisa) gross_profit_paisa from lines group by product_id),
   page as (select * from groups order by gross_paisa desc,id limit lim offset offst),chart as (select * from groups order by gross_paisa desc,id limit 10),
   export_page as (select sale_id,number,completed_at,product_id,product_name_snapshot,sku_snapshot,unit_snapshot,quantity,unit_price_paisa,line_gross_paisa,unit_cost_paisa,line_cost_paisa,line_gross_paisa-line_cost_paisa line_profit_before_discount_paisa,case when export_line=1 then discount_paisa else null end order_discount_paisa,line_gross_paisa-line_cost_paisa-case when export_line=1 then discount_paisa else 0 end net_profit_contribution_paisa from lines order by completed_at,sale_id,line_position limit 100001)
   select jsonb_build_object('kind',p_kind,'snapshot_at',private.business_clock(sid),'business_date',day,'from',first_day,'to',last_day,
    'summary',jsonb_build_object('count',(select count(*) from docs),'units',(select coalesce(sum(quantity),0) from lines),'total_paisa',(select coalesce(sum(total_paisa),0)::text from docs),'discount_paisa',(select coalesce(sum(discount_paisa),0)::text from docs),'subtotal_paisa',(select coalesce(sum(subtotal_paisa),0)::text from docs),'cogs_paisa',(select coalesce(sum(line_cost_paisa),0)::text from lines),'net_profit_paisa',((select coalesce(sum(total_paisa),0) from docs)-(select coalesce(sum(line_cost_paisa),0) from lines))::text,'average_paisa',(select case when count(*)=0 then '0' else round(sum(total_paisa)::numeric/count(*))::text end from docs)),
    'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'chart',coalesce((select jsonb_agg(to_jsonb(chart)) from chart),'[]'),'total',(select count(*) from groups),'page',offst/lim+1,'size',lim,'source_count',(select count(*) from lines),'source_rows',case when p_export then coalesce((select jsonb_agg(to_jsonb(export_page)) from export_page),'[]') else '[]'::jsonb end) into result;
  elsif p_kind='purchases' then
   with docs as (select * from public.purchases where store_id=sid and status='received' and received_at>=start_at and received_at<end_at and (nullif(f->>'supplier','') is null or supplier_id=(f->>'supplier')::uuid)),lines as (
    select i.*,p.number,p.received_at,p.purchase_date,p.supplier_id,p.supplier_name_snapshot from public.purchase_items i join docs p on p.id=i.purchase_id where i.store_id=sid
   ),groups as (select product_id id,(array_agg(product_name_snapshot order by received_at desc,purchase_id desc,line_position))[1] name,(array_agg(sku_snapshot order by received_at desc,purchase_id desc,line_position))[1] sku,sum(quantity) quantity,sum(line_total_paisa) total_paisa,min(unit_cost_paisa) min_cost_paisa,max(unit_cost_paisa) max_cost_paisa from lines group by product_id),
   page as (select * from groups order by total_paisa desc,id limit lim offset offst),chart as (select * from groups order by total_paisa desc,id limit 10),
   suppliers as (select supplier_id id,(array_agg(supplier_name_snapshot order by received_at desc,id desc))[1] name,count(*) count,sum(total_paisa) total_paisa from docs group by supplier_id),
   export_page as (select purchase_id,number,supplier_id,supplier_name_snapshot,received_at,purchase_date,product_id,product_name_snapshot,sku_snapshot,unit_snapshot,quantity,unit_cost_paisa,line_total_paisa from lines order by received_at,purchase_id,line_position limit 100001)
   select jsonb_build_object('kind',p_kind,'snapshot_at',private.business_clock(sid),'business_date',day,'from',first_day,'to',last_day,
    'summary',jsonb_build_object('count',(select count(*) from docs),'units',(select coalesce(sum(quantity),0) from lines),'total_paisa',(select coalesce(sum(total_paisa),0)::text from docs)),
    'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'chart',coalesce((select jsonb_agg(to_jsonb(chart)) from chart),'[]'),'users',coalesce((select jsonb_agg(to_jsonb(users) order by total_paisa desc,id) from users),'[]'),'total',(select count(*) from groups),'page',offst/lim+1,'size',lim,'source_count',(select count(*) from lines),'source_rows',case when p_export then coalesce((select jsonb_agg(to_jsonb(export_page)) from export_page),'[]') else '[]'::jsonb end) into result;
  else perform private.fail('VALIDATION_ERROR'); end if;
 end if;
 if p_export and (result->>'source_count')::bigint>100000 then perform private.fail('EXPORT_ROW_LIMIT'); end if;
 return private.safe_json(result);
end $$;

revoke all on function public.complete_sale(jsonb,uuid),public.get_workspace(),public.get_report(text,jsonb,boolean) from public,anon;
grant execute on function public.complete_sale(jsonb,uuid),public.get_workspace(),public.get_report(text,jsonb,boolean) to authenticated;
