begin;
create function public.si_dashboard(p_org uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.si_organizations; d date; from_time timestamptz; to_time timestamptz; result jsonb; begin
  if si_private.member_role(p_org) is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into o from public.si_organizations where id=p_org;
  d:=(now() at time zone o.timezone)::date; from_time:=d::timestamp at time zone o.timezone; to_time:=(d+1)::timestamp at time zone o.timezone;
  select jsonb_build_object(
    'today_sales_minor',coalesce((select sum(total_minor) from public.si_sales where org_id=p_org and created_at>=from_time and created_at<to_time),0),
    'today_returns_minor',coalesce((select sum(value_minor) from public.si_returns where org_id=p_org and source_type='sale' and created_at>=from_time and created_at<to_time),0),
    'today_orders',(select count(*) from public.si_sales where org_id=p_org and created_at>=from_time and created_at<to_time),
    'product_count',(select count(*) from public.si_products where org_id=p_org and active),
    'stock_units',coalesce((select sum(stock) from public.si_products where org_id=p_org and active),0),
    'low_stock_count',(select count(*) from public.si_products where org_id=p_org and active and low_stock),
    'low_stock',coalesce((select jsonb_agg(t) from (select id,name,sku,stock,reorder_level,unit from public.si_products where org_id=p_org and active and low_stock order by stock,name limit 8)t),'[]'::jsonb),
    'recent_sales',coalesce((select jsonb_agg(t) from (select id,reference,total_minor,paid_minor,returned_minor,refunded_minor,status,created_at from public.si_sales where org_id=p_org order by created_at desc limit 6)t),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day::date,'sales_minor',coalesce((select sum(s.total_minor) from public.si_sales s where s.org_id=p_org and (s.created_at at time zone o.timezone)::date=day::date),0),'returns_minor',coalesce((select sum(r.value_minor) from public.si_returns r where r.org_id=p_org and r.source_type='sale' and (r.created_at at time zone o.timezone)::date=day::date),0)) order by day) from generate_series((d-6)::timestamp,d::timestamp,'1 day') day),'[]'::jsonb)
  ) into result;
  return result;
end $$;
create function public.si_report(p_org uuid,p_from date,p_to date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.si_organizations; f timestamptz; t timestamptz; sold numeric; tax numeric; ret numeric; ret_tax numeric; cogs numeric; ret_cost numeric; collected numeric; purchase_paid numeric; result jsonb; begin
  if si_private.member_role(p_org) not in ('owner','manager') or si_private.member_role(p_org) is null then raise exception 'Manager access required' using errcode='42501'; end if;
  if p_from is null or p_to is null or p_from>p_to or p_to-p_from>365 then raise exception 'Choose a range of at most 366 days'; end if;
  select * into o from public.si_organizations where id=p_org;
  f:=p_from::timestamp at time zone o.timezone; t:=(p_to+1)::timestamp at time zone o.timezone;
  select coalesce(sum(total_minor),0),coalesce(sum(tax_minor),0) into sold,tax from public.si_sales where org_id=p_org and created_at>=f and created_at<t;
  select coalesce(sum(value_minor),0),coalesce(sum(tax_minor),0),coalesce(sum(cost_minor),0) into ret,ret_tax,ret_cost from public.si_returns where org_id=p_org and source_type='sale' and created_at>=f and created_at<t;
  select coalesce(sum(i.quantity::numeric*i.unit_cost_minor),0) into cogs from public.si_sale_items i join public.si_sales s on s.id=i.sale_id and s.org_id=i.org_id where s.org_id=p_org and s.created_at>=f and s.created_at<t;
  select coalesce(sum(case when kind='payment' then amount_minor else -amount_minor end),0) into collected from public.si_payments where org_id=p_org and source_type='sale' and created_at>=f and created_at<t;
  select coalesce(sum(case when kind='payment' then amount_minor else -amount_minor end),0) into purchase_paid from public.si_payments where org_id=p_org and source_type='purchase' and created_at>=f and created_at<t;
  select jsonb_build_object('from',p_from,'to',p_to,'timezone',o.timezone,'summary',jsonb_build_object(
    'sales_minor',sold,'returns_minor',ret,'net_sales_minor',sold-ret,'net_tax_minor',tax-ret_tax,
    'revenue_minor',sold-tax-ret+ret_tax,'cogs_minor',cogs-ret_cost,'gross_profit_minor',sold-tax-ret+ret_tax-cogs+ret_cost,
    'collected_minor',collected,'supplier_paid_minor',purchase_paid,'net_cash_flow_minor',collected-purchase_paid,
    'purchase_received_minor',coalesce((select sum(total_minor) from public.si_purchases where org_id=p_org and received_at>=f and received_at<t),0),
    'purchase_returns_minor',coalesce((select sum(value_minor) from public.si_returns where org_id=p_org and source_type='purchase' and created_at>=f and created_at<t),0),
    'current_stock_value_minor',coalesce((select sum(stock::numeric*cost_minor) from public.si_products where org_id=p_org),0),
    'current_receivables_minor',coalesce((select sum(greatest(total_minor-returned_minor-paid_minor+refunded_minor,0)) from public.si_sales where org_id=p_org),0),
    'current_payables_minor',coalesce((select sum(greatest(total_minor-returned_minor-paid_minor+refunded_minor,0)) from public.si_purchases where org_id=p_org and status not in ('draft','cancelled')),0)
  ),
  'top_products',coalesce((select jsonb_agg(x) from (select i.product_id,max(i.product_name) as name,max(i.sku) as sku,sum(i.quantity) as units_sold,sum(i.line_total_minor) as sales_minor from public.si_sale_items i join public.si_sales s on s.id=i.sale_id and s.org_id=i.org_id where s.org_id=p_org and s.created_at>=f and s.created_at<t group by i.product_id order by sum(i.line_total_minor) desc limit 10)x),'[]'::jsonb),
  'daily',coalesce((select jsonb_agg(jsonb_build_object('date',day::date,'sales_minor',coalesce((select sum(s.total_minor) from public.si_sales s where s.org_id=p_org and (s.created_at at time zone o.timezone)::date=day::date),0),'returns_minor',coalesce((select sum(r.value_minor) from public.si_returns r where r.org_id=p_org and r.source_type='sale' and (r.created_at at time zone o.timezone)::date=day::date),0)) order by day) from generate_series(p_from::timestamp,p_to::timestamp,'1 day') day),'[]'::jsonb)) into result;
  return result;
end $$;
-- Durable per-user/hour quota. Context contains no customer/supplier contact information.
create function public.si_ai_context(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_count integer; v_hour timestamptz:=date_trunc('hour',now()); begin
  if si_private.member_role(p_org) not in ('owner','manager') or si_private.member_role(p_org) is null then raise exception 'Manager access required' using errcode='42501'; end if;
  insert into si_private.ai_limits(org_id,user_id,hour,calls) values(p_org,auth.uid(),v_hour,1)
  on conflict(org_id,user_id,hour) do update set calls=si_private.ai_limits.calls+1 returning calls into v_count;
  if v_count>20 then raise exception 'AI hourly limit reached. Try again next hour'; end if;
  return jsonb_build_object('dashboard',public.si_dashboard(p_org),'low_stock',coalesce((select jsonb_agg(x) from (select id,name,sku,stock,reorder_level,unit from public.si_products where org_id=p_org and active and low_stock order by stock,name limit 30)x),'[]'::jsonb));
end $$;
revoke all on function public.si_dashboard(uuid),public.si_report(uuid,date,date),public.si_ai_context(uuid) from public,anon,authenticated;
grant execute on function public.si_dashboard(uuid),public.si_report(uuid,date,date),public.si_ai_context(uuid) to authenticated;
commit;
