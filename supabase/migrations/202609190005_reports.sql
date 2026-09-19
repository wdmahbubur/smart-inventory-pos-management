-- All aggregate totals are computed over matching SQL records, never a browser page.
create function public.list_documents(p_kind text,p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); result jsonb; lim integer:=coalesce((p_filters->>'size')::integer,20); offst integer:=(coalesce((p_filters->>'page')::integer,1)-1)*lim; q text:=lower(coalesce(p_filters->>'q','')); start_at timestamptz; end_at timestamptz;
begin
 perform private.validate_filters(p_filters);
 start_at:=((p_filters->>'from')::date::timestamp at time zone 'Asia/Dhaka'); end_at:=(((p_filters->>'to')::date+1)::timestamp at time zone 'Asia/Dhaka');
 if p_kind='purchases' then
  with items as (select purchase_id,count(*) product_count,sum(quantity) units from public.purchase_items where store_id=sid group by purchase_id),base as (
   select p.*,coalesce(p.supplier_name_snapshot,s.name) supplier_name,coalesce(i.product_count,0) product_count,coalesce(i.units,0) units,coalesce(p.received_at,p.updated_at) activity_at
   from public.purchases p join public.suppliers s on s.id=p.supplier_id left join items i on i.purchase_id=p.id where p.store_id=sid
    and (start_at is null or coalesce(p.received_at,p.updated_at)>=start_at and coalesce(p.received_at,p.updated_at)<end_at)
    and (nullif(p_filters->>'supplier','') is null or p.supplier_id=(p_filters->>'supplier')::uuid)
    and (q='' or position(q in lower(p.number||' '||coalesce(p.supplier_name_snapshot,s.name)||' '||coalesce(p.supplier_reference,'')))>0)
  ),filtered as (select * from base where coalesce(p_filters->>'status','')='' or status=p_filters->>'status'),page as (select * from filtered order by activity_at desc,id desc limit lim offset offst)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'all_count',(select count(*) from base),'received_count',(select count(*) from base where status='received'),'draft_count',(select count(*) from base where status='draft'),'total_paisa',(select coalesce(sum(total_paisa),0)::text from base where status='received'),'page',offst/lim+1,'size',lim) into result;
 elsif p_kind='sales' then
  with items as (select sale_id,sum(quantity) units,count(*) product_count from public.sale_items where store_id=sid group by sale_id),filtered as (
   select s.*,coalesce(i.units,0) units,coalesce(i.product_count,0) product_count from public.sales s left join items i on i.sale_id=s.id where s.store_id=sid
   and (start_at is null or s.completed_at>=start_at and s.completed_at<end_at) and (q='' or position(q in lower(s.number||' '||coalesce(s.customer_name,'Walk-in customer')))>0)
  ),page as (select * from filtered order by completed_at desc,id desc limit lim offset offst)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'total_paisa',(select coalesce(sum(total_paisa),0)::text from filtered),'discount_paisa',(select coalesce(sum(discount_paisa),0)::text from filtered),'units',(select coalesce(sum(units),0) from filtered),'page',offst/lim+1,'size',lim) into result;
 elsif p_kind='movements' then
  with filtered as (
   select m.*,coalesce(pi.product_name_snapshot,si.product_name_snapshot) product_name,coalesce(pi.sku_snapshot,si.sku_snapshot) sku,coalesce(pi.unit_snapshot,si.unit_snapshot) unit,p.icon_key,p.color_key,coalesce(ph.id,sh.id) source_id,coalesce(ph.number,sh.number) number
   from public.stock_movements m join public.products p on p.id=m.product_id left join public.purchase_items pi on pi.id=m.purchase_item_id left join public.purchases ph on ph.id=pi.purchase_id left join public.sale_items si on si.id=m.sale_item_id left join public.sales sh on sh.id=si.sale_id
   where m.store_id=sid and (start_at is null or m.created_at>=start_at and m.created_at<end_at)
    and (coalesce(p_filters->>'status','')='' or m.source_type=p_filters->>'status')
    and (nullif(p_filters->>'product','') is null or m.product_id=(p_filters->>'product')::uuid)
    and (nullif(p_filters->>'document','') is null or coalesce(ph.id,sh.id)=(p_filters->>'document')::uuid)
    and (q='' or position(q in lower(coalesce(pi.product_name_snapshot,si.product_name_snapshot)||' '||coalesce(ph.number,sh.number)||' '||coalesce(pi.sku_snapshot,si.sku_snapshot)))>0)
  ),page as (select * from filtered order by sequence desc limit lim offset offst)
  select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'page',offst/lim+1,'size',lim) into result;
 else perform private.fail('VALIDATION_ERROR'); end if;
 return private.safe_json(result);
end $$;

create function public.get_report(p_kind text,p_filters jsonb default '{}',p_export boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); result jsonb; ws jsonb; listing jsonb; f jsonb:=p_filters; day date:=(private.business_clock(sid) at time zone 'Asia/Dhaka')::date; first_day date; last_day date; start_at timestamptz; end_at timestamptz; lim integer:=coalesce((f->>'size')::integer,20); offst integer:=(coalesce((f->>'page')::integer,1)-1)*lim;
begin
 perform private.validate_filters(f);
 if p_kind='inventory' then
  if f ? 'from' or f ? 'to' or coalesce((f->>'archived')::boolean,false) then perform private.fail('VALIDATION_ERROR'); end if;
  ws:=public.get_workspace(); listing:=public.list_catalog('products',f);
  with records as (
   select p.id,p.name,p.sku,p.unit,c.name category_name,b.quantity,p.minimum_stock,p.reference_cost_paisa,b.quantity::numeric*p.reference_cost_paisa stock_value_paisa,case when b.quantity=0 then 'out_of_stock' when b.quantity<p.minimum_stock then 'low_stock' else 'in_stock' end stock_status
   from public.products p join public.inventory_balances b on b.product_id=p.id join public.categories c on c.id=p.category_id where p.store_id=sid and p.archived_at is null
   and (coalesce(f->>'q','')='' or position(lower(f->>'q') in lower(p.name||' '||p.sku))>0) and (nullif(f->>'category','') is null or p.category_id=(f->>'category')::uuid)
  ),filtered as (select * from records where coalesce(f->>'stock','')='' or stock_status=f->>'stock' or f->>'stock'='attention' and stock_status<>'in_stock'),export_page as (select * from filtered order by lower(name),id limit 100001)
  select jsonb_build_object('kind',p_kind,'snapshot_at',ws->'snapshot_at','business_date',day,'summary',ws->'inventory','chart',ws->'categories','rows',listing->'rows','total',listing->'total','filtered_value_paisa',listing->'filtered_value_paisa','page',offst/lim+1,'size',lim,'source_count',(select count(*) from filtered),'source_rows',case when p_export then coalesce((select jsonb_agg(to_jsonb(export_page)) from export_page),'[]') else '[]'::jsonb end) into result;
 else
  first_day:=coalesce((f->>'from')::date,day); last_day:=coalesce((f->>'to')::date,day);
  f:=f||jsonb_build_object('from',first_day,'to',last_day); perform private.validate_filters(f);
  start_at:=first_day::timestamp at time zone 'Asia/Dhaka'; end_at:=(last_day+1)::timestamp at time zone 'Asia/Dhaka';
  if p_kind='sales' then
   with docs as (select * from public.sales where store_id=sid and completed_at>=start_at and completed_at<end_at),lines as (
    select i.*,s.number,s.completed_at,s.discount_paisa,s.total_paisa sale_total_paisa,row_number() over(partition by i.sale_id order by i.line_position,i.id) export_line
    from public.sale_items i join docs s on s.id=i.sale_id where i.store_id=sid
   ),groups as (select product_id id,(array_agg(product_name_snapshot order by completed_at desc,sale_id desc,line_position))[1] name,(array_agg(sku_snapshot order by completed_at desc,sale_id desc,line_position))[1] sku,sum(quantity) quantity,sum(line_gross_paisa) gross_paisa from lines group by product_id),
   page as (select * from groups order by gross_paisa desc,id limit lim offset offst),chart as (select * from groups order by gross_paisa desc,id limit 10),
   export_page as (select sale_id,number,completed_at,product_id,product_name_snapshot,sku_snapshot,unit_snapshot,quantity,unit_price_paisa,line_gross_paisa,case when export_line=1 then discount_paisa else null end order_discount_paisa from lines order by completed_at,sale_id,line_position limit 100001)
   select jsonb_build_object('kind',p_kind,'snapshot_at',private.business_clock(sid),'business_date',day,'from',first_day,'to',last_day,
    'summary',jsonb_build_object('count',(select count(*) from docs),'units',(select coalesce(sum(quantity),0) from lines),'total_paisa',(select coalesce(sum(total_paisa),0)::text from docs),'discount_paisa',(select coalesce(sum(discount_paisa),0)::text from docs),'subtotal_paisa',(select coalesce(sum(subtotal_paisa),0)::text from docs),'average_paisa',(select case when count(*)=0 then '0' else round(sum(total_paisa)::numeric/count(*))::text end from docs)),
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
    'rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'chart',coalesce((select jsonb_agg(to_jsonb(chart)) from chart),'[]'),'suppliers',coalesce((select jsonb_agg(to_jsonb(suppliers) order by total_paisa desc,id) from suppliers),'[]'),'total',(select count(*) from groups),'page',offst/lim+1,'size',lim,'source_count',(select count(*) from lines),'source_rows',case when p_export then coalesce((select jsonb_agg(to_jsonb(export_page)) from export_page),'[]') else '[]'::jsonb end) into result;
  else perform private.fail('VALIDATION_ERROR'); end if;
 end if;
 if p_export and (result->>'source_count')::bigint>100000 then perform private.fail('EXPORT_ROW_LIMIT'); end if;
 return private.safe_json(result);
end $$;
revoke all on function public.list_documents(text,jsonb),public.get_report(text,jsonb,boolean) from public,anon;
grant execute on function public.list_documents(text,jsonb),public.get_report(text,jsonb,boolean) to authenticated;
