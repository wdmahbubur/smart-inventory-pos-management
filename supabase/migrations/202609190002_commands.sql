begin;
create function si_private.int_field(p jsonb,k text,lo bigint,hi bigint,d bigint default null) returns bigint language plpgsql immutable set search_path='' as $$
declare v numeric; begin
  if p->k is null or p->k='null'::jsonb then if d is null then raise exception '% is required',k; end if; return d; end if;
  if jsonb_typeof(p->k)<>'number' then raise exception '% must be an integer',k; end if;
  v := (p->>k)::numeric; if v<>trunc(v) or v<lo or v>hi then raise exception '% is outside the allowed range',k; end if; return v::bigint;
end $$;
create function si_private.text_field(p jsonb,k text,n integer,required boolean default false) returns text language plpgsql immutable set search_path='' as $$
declare v text; begin
  if p->k is not null and p->k<>'null'::jsonb and jsonb_typeof(p->k)<>'string' then raise exception '% must be text',k; end if;
  v:=btrim(coalesce(p->>k,'')); if length(v)>n or (required and v='') then raise exception '% is required or exceeds % characters',k,n; end if; return v;
end $$;
create function si_private.assert_lines(p jsonb) returns void language plpgsql immutable set search_path='' as $$
begin
  if jsonb_typeof(p)<>'array' or p is null or jsonb_array_length(p) not between 1 and 100 then raise exception 'Add between 1 and 100 products'; end if;
  if exists(select 1 from jsonb_array_elements(p) x where jsonb_typeof(x)<>'object' or x->>'product_id' is null) then raise exception 'Invalid product line'; end if;
  if (select count(distinct x->>'product_id') from jsonb_array_elements(p) x) <> jsonb_array_length(p) then raise exception 'Duplicate products are not allowed'; end if;
end $$;
create function public.si_bootstrap(p_name text,p_currency text,p_timezone text,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_org public.si_organizations; v_email text; begin
  if auth.uid() is null then raise exception 'Sign in to create a workspace' using errcode='42501'; end if;
  if p_key is null then raise exception 'Request ID is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
  select * into v_org from public.si_organizations where bootstrap_key=p_key and created_by=auth.uid(); if found then return to_jsonb(v_org); end if;
  if (select count(*) from public.si_organizations where created_by=auth.uid())>=5 then raise exception 'Workspace limit reached'; end if;
  if length(btrim(p_name)) not between 1 and 160 or p_name is null then raise exception 'Business name is required'; end if;
  if not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone'; end if;
  select email into v_email from auth.users where id=auth.uid();
  insert into public.si_organizations(bootstrap_key,name,currency,timezone,created_by) values(p_key,btrim(p_name),p_currency,p_timezone,auth.uid()) returning * into v_org;
  insert into public.si_members(org_id,user_id,email,role) values(v_org.id,auth.uid(),v_email,'owner'); return to_jsonb(v_org);
end $$;
-- A workspace row lock serializes inventory mutations. All writes are transactional RPCs.
create function public.si_mutate(p_org uuid,p_action text,p_payload jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_role text; v_org public.si_organizations; v_product public.si_products; v_purchase public.si_purchases; v_sale public.si_sales;
  v_pi public.si_purchase_items; v_si public.si_sale_items; v_request si_private.requests;
  v_id uuid; v_contact uuid; v_category uuid; v_user uuid; v_return uuid;
  v_lines jsonb; v_line jsonb; v_result jsonb; v_return_lines jsonb:='[]';
  v_name text; v_sku text; v_kind text; v_method text; v_reason text; v_email text; v_active boolean;
  v_qty bigint; v_delta bigint; v_cost bigint; v_price bigint; v_paid bigint; v_due bigint;
  v_sub bigint:=0; v_discount bigint:=0; v_tax bigint:=0; v_total bigint:=0;
  v_running bigint:=0; v_net_running bigint:=0; v_alloc_d bigint:=0; v_alloc_t bigint:=0;
  v_d bigint; v_t bigint; v_gross bigint; v_line_total bigint;
  v_return_total bigint:=0; v_return_tax bigint:=0; v_return_cost bigint:=0; v_refund bigint:=0;
begin
  if p_org is null or p_key is null or p_action is null then raise exception 'Workspace, action and request ID are required'; end if;
  if jsonb_typeof(p_payload)<>'object' or p_payload is null or octet_length(p_payload::text)>131072 then raise exception 'Invalid or oversized request'; end if;
  if si_private.member_role(p_org) is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
  select * into v_org from public.si_organizations where id=p_org for update;
  v_role:=si_private.member_role(p_org); if v_role is null then raise exception 'Workspace access denied' using errcode='42501'; end if;
  if p_action in ('settings_save','member_save') and v_role<>'owner' then raise exception 'Owner access required' using errcode='42501'; end if;
  if p_action not in ('sale_checkout','contact_save','payment_add') and v_role='cashier' then raise exception 'Manager access required' using errcode='42501'; end if;
  if v_role='cashier' and ((p_action='contact_save' and p_payload->>'kind' is distinct from 'customer') or (p_action='payment_add' and p_payload->>'source_type' is distinct from 'sale')) then raise exception 'Manager access required' using errcode='42501'; end if;
  select * into v_request from si_private.requests where org_id=p_org and request_id=p_key;
  if found then if v_request.action<>p_action or v_request.payload<>p_payload then raise exception 'Request ID was already used for different data'; end if; return v_request.result; end if;
  v_id:=nullif(p_payload->>'id','')::uuid;
  if p_action='product_save' then
    v_name:=si_private.text_field(p_payload,'name',160,true); v_sku:=si_private.text_field(p_payload,'sku',80,true); v_price:=si_private.int_field(p_payload,'price_minor',0,1000000000000);
    v_category:=nullif(p_payload->>'category_id','')::uuid;
    if v_category is not null and not exists(select 1 from public.si_categories where id=v_category and org_id=p_org and active) then raise exception 'Select an active category in this workspace'; end if;
    v_active:=coalesce((p_payload->>'active')::boolean,true);
    if v_id is null then
      insert into public.si_products(org_id,name,sku,barcode,category_id,price_minor,reorder_level,unit,active) values(p_org,v_name,v_sku,nullif(si_private.text_field(p_payload,'barcode',80),''),v_category,v_price,si_private.int_field(p_payload,'reorder_level',0,1000000,5),coalesce(nullif(si_private.text_field(p_payload,'unit',20),''),'pcs'),v_active) returning * into v_product;
    else
      select * into v_product from public.si_products where id=v_id and org_id=p_org; if not found then raise exception 'Product not found'; end if;
      if not v_active and v_product.stock>0 then raise exception 'Reduce stock to zero before archiving this product'; end if;
      update public.si_products set name=v_name,sku=v_sku,barcode=nullif(si_private.text_field(p_payload,'barcode',80),''),category_id=v_category,price_minor=v_price,reorder_level=si_private.int_field(p_payload,'reorder_level',0,1000000,5),unit=coalesce(nullif(si_private.text_field(p_payload,'unit',20),''),'pcs'),active=v_active,updated_at=now() where id=v_id and org_id=p_org returning * into v_product;
    end if;
    v_id:=v_product.id; v_result:=to_jsonb(v_product);
  elsif p_action='category_save' then
    v_name:=si_private.text_field(p_payload,'name',80,true); v_active:=coalesce((p_payload->>'active')::boolean,true);
    if v_id is null then insert into public.si_categories(org_id,name,active) values(p_org,v_name,v_active) returning id into v_id;
    else update public.si_categories set name=v_name,active=v_active where id=v_id and org_id=p_org; if not found then raise exception 'Category not found'; end if; end if;
    select to_jsonb(t) into v_result from public.si_categories t where id=v_id;
  elsif p_action='contact_save' then
    v_kind:=si_private.text_field(p_payload,'kind',20,true);
    if v_kind not in ('customer','supplier') or (v_kind='supplier' and v_role='cashier') then raise exception 'Contact type not permitted' using errcode='42501'; end if;
    v_name:=si_private.text_field(p_payload,'name',160,true); v_email:=si_private.text_field(p_payload,'email',254); v_active:=coalesce((p_payload->>'active')::boolean,true);
    if v_email<>'' and position('@' in v_email)<2 then raise exception 'Invalid email address'; end if;
    if v_id is null then
      insert into public.si_contacts(org_id,kind,name,email,phone,address,active) values(p_org,v_kind,v_name,v_email,si_private.text_field(p_payload,'phone',60),si_private.text_field(p_payload,'address',500),v_active) returning id into v_id;
    else
      update public.si_contacts set name=v_name,email=v_email,phone=si_private.text_field(p_payload,'phone',60),address=si_private.text_field(p_payload,'address',500),active=v_active where id=v_id and org_id=p_org and kind=v_kind; if not found then raise exception 'Contact not found'; end if;
    end if;
    select to_jsonb(t) into v_result from public.si_contacts t where id=v_id;
  elsif p_action='purchase_save' then
    v_lines:=p_payload->'lines'; perform si_private.assert_lines(v_lines); v_contact:=nullif(p_payload->>'supplier_id','')::uuid;
    if v_contact is not null and not exists(select 1 from public.si_contacts where id=v_contact and org_id=p_org and kind='supplier' and active) then raise exception 'Supplier not found'; end if;
    v_method:=coalesce(nullif(si_private.text_field(p_payload,'payment_method',20),''),'cash'); if v_method not in ('cash','card','mobile') then raise exception 'Invalid payment method'; end if;
    if v_id is null then
      insert into public.si_purchases(org_id,supplier_id,notes,payment_method,created_by) values(p_org,v_contact,si_private.text_field(p_payload,'notes',2000),v_method,auth.uid()) returning id into v_id;
    else
      select * into v_purchase from public.si_purchases where id=v_id and org_id=p_org; if not found or v_purchase.status<>'draft' then raise exception 'Only draft purchases can be edited'; end if;
      delete from public.si_purchase_items where purchase_id=v_id and org_id=p_org;
    end if;
    for v_line in select value from jsonb_array_elements(v_lines) loop
      select * into v_product from public.si_products where id=(v_line->>'product_id')::uuid and org_id=p_org and active; if not found then raise exception 'Product not found or archived'; end if;
      v_qty:=si_private.int_field(v_line,'quantity',1,1000000); v_cost:=si_private.int_field(v_line,'unit_cost_minor',0,1000000000000);
      if v_qty::numeric*v_cost+v_sub>1000000000000 then raise exception 'Purchase total exceeds limit'; end if; v_sub:=v_sub+v_qty*v_cost;
      insert into public.si_purchase_items(org_id,purchase_id,product_id,product_name,sku,quantity,unit_cost_minor) values(p_org,v_id,v_product.id,v_product.name,v_product.sku,v_qty,v_cost);
    end loop;
    v_paid:=si_private.int_field(p_payload,'paid_minor',0,v_sub,0);
    update public.si_purchases set supplier_id=v_contact,notes=si_private.text_field(p_payload,'notes',2000),payment_method=v_method,total_minor=v_sub,paid_minor=v_paid where id=v_id and org_id=p_org returning * into v_purchase; v_result:=to_jsonb(v_purchase);
  elsif p_action='purchase_receive' then
    select * into v_purchase from public.si_purchases where id=v_id and org_id=p_org; if not found or v_purchase.status<>'draft' then raise exception 'Only a draft purchase can be received'; end if;
    if not exists(select 1 from public.si_purchase_items where purchase_id=v_id and org_id=p_org) then raise exception 'Purchase has no products'; end if;
    for v_pi in select * from public.si_purchase_items where purchase_id=v_id and org_id=p_org order by product_id loop
      select * into v_product from public.si_products where id=v_pi.product_id and org_id=p_org;
      if not v_product.active then raise exception 'A product was archived; update the draft before receiving'; end if;
      if v_product.stock+v_pi.quantity>1000000 then raise exception 'Stock exceeds quantity limit'; end if;
      v_cost:=round((v_product.stock::numeric*v_product.cost_minor+v_pi.quantity::numeric*v_pi.unit_cost_minor)/(v_product.stock+v_pi.quantity));
      update public.si_products set stock=stock+v_pi.quantity,cost_minor=v_cost,updated_at=now() where id=v_product.id and org_id=p_org returning * into v_product;
      insert into public.si_stock_movements(org_id,product_id,kind,source_id,request_id,delta,balance_after,unit_cost_minor,created_by) values(p_org,v_product.id,'purchase',v_id,p_key,v_pi.quantity,v_product.stock,v_pi.unit_cost_minor,auth.uid());
    end loop;
    update public.si_purchases set status='received',received_at=now() where id=v_id and org_id=p_org returning * into v_purchase;
    if v_purchase.paid_minor>0 then insert into public.si_payments(org_id,source_id,source_type,kind,amount_minor,method,created_by) values(p_org,v_id,'purchase','payment',v_purchase.paid_minor,v_purchase.payment_method,auth.uid()); end if;
    v_result:=to_jsonb(v_purchase);
  elsif p_action='purchase_cancel' then
    update public.si_purchases set status='cancelled' where id=v_id and org_id=p_org and status='draft' returning * into v_purchase; if not found then raise exception 'Only a draft purchase can be cancelled'; end if; v_result:=to_jsonb(v_purchase);
  elsif p_action='sale_checkout' then
    v_lines:=p_payload->'lines'; perform si_private.assert_lines(v_lines); v_contact:=nullif(p_payload->>'customer_id','')::uuid;
    if v_contact is not null and not exists(select 1 from public.si_contacts where id=v_contact and org_id=p_org and kind='customer' and active) then raise exception 'Customer not found'; end if;
    for v_line in select value from jsonb_array_elements(v_lines) loop
      select * into v_product from public.si_products where id=(v_line->>'product_id')::uuid and org_id=p_org and active; if not found then raise exception 'Product not found or archived'; end if;
      v_qty:=si_private.int_field(v_line,'quantity',1,1000000); if v_product.stock<v_qty then raise exception 'Insufficient stock for %',v_product.name; end if;
      if v_qty::numeric*v_product.price_minor+v_sub>1000000000000 then raise exception 'Sale total exceeds limit'; end if; v_sub:=v_sub+v_qty*v_product.price_minor;
    end loop;
    v_discount:=si_private.int_field(p_payload,'discount_minor',0,v_sub,0); v_tax:=round((v_sub-v_discount)::numeric*v_org.tax_bps/10000); v_total:=v_sub-v_discount+v_tax;
    if v_total>1000000000000 then raise exception 'Sale total exceeds limit'; end if;
    if si_private.int_field(p_payload,'expected_total_minor',0,1000000000000)<>v_total then raise exception 'Prices or tax changed. Refresh the cart and review the new total'; end if;
    v_paid:=si_private.int_field(p_payload,'tendered_minor',0,1000000000000,0); v_method:=si_private.text_field(p_payload,'payment_method',20,true);
    if v_method not in ('cash','card','mobile','credit') then raise exception 'Invalid payment method'; end if;
    if v_method<>'cash' and v_paid>v_total then raise exception 'Only cash payments support change'; end if;
    if v_method='credit' and v_paid<>0 then raise exception 'Credit transactions cannot include a payment'; end if;
    if v_paid<v_total and v_contact is null then raise exception 'Select a customer for an unpaid balance'; end if;
    insert into public.si_sales(org_id,customer_id,subtotal_minor,discount_minor,tax_bps,tax_minor,total_minor,paid_minor,change_minor,payment_method,receipt_snapshot,notes,created_by)
    values(p_org,v_contact,v_sub,v_discount,v_org.tax_bps,v_tax,v_total,least(v_paid,v_total),greatest(v_paid-v_total,0),v_method,jsonb_build_object('name',v_org.name,'currency',v_org.currency,'address',v_org.address,'phone',v_org.phone,'footer',v_org.receipt_footer),si_private.text_field(p_payload,'notes',2000),auth.uid()) returning * into v_sale; v_id:=v_sale.id;
    for v_line in select value from jsonb_array_elements(v_lines) loop
      select * into v_product from public.si_products where id=(v_line->>'product_id')::uuid and org_id=p_org;
      v_qty:=si_private.int_field(v_line,'quantity',1,1000000); v_gross:=v_qty*v_product.price_minor; v_running:=v_running+v_gross;
      v_d:=case when v_sub=0 then 0 else floor(v_discount::numeric*v_running/v_sub) end; v_net_running:=v_net_running+v_gross-(v_d-v_alloc_d);
      v_t:=case when v_sub=v_discount then 0 else floor(v_tax::numeric*v_net_running/(v_sub-v_discount)) end; v_line_total:=v_gross-(v_d-v_alloc_d)+(v_t-v_alloc_t);
      insert into public.si_sale_items(org_id,sale_id,product_id,product_name,sku,quantity,unit_price_minor,unit_cost_minor,discount_minor,tax_minor,line_total_minor) values(p_org,v_id,v_product.id,v_product.name,v_product.sku,v_qty,v_product.price_minor,v_product.cost_minor,v_d-v_alloc_d,v_t-v_alloc_t,v_line_total);
      v_alloc_d:=v_d; v_alloc_t:=v_t;
      update public.si_products set stock=stock-v_qty,updated_at=now() where id=v_product.id and org_id=p_org returning * into v_product;
      insert into public.si_stock_movements(org_id,product_id,kind,source_id,request_id,delta,balance_after,unit_cost_minor,created_by) values(p_org,v_product.id,'sale',v_id,p_key,-v_qty,v_product.stock,v_product.cost_minor,auth.uid());
    end loop;
    if v_sale.paid_minor>0 then insert into public.si_payments(org_id,source_id,source_type,kind,amount_minor,method,created_by) values(p_org,v_id,'sale','payment',v_sale.paid_minor,v_method,auth.uid()); end if; v_result:=to_jsonb(v_sale);
  elsif p_action in ('sale_return','sale_void','purchase_return') then
    v_reason:=si_private.text_field(p_payload,'reason',2000,true); if length(v_reason)<3 then raise exception 'Give a reason of at least 3 characters'; end if;
    v_kind:=case when p_action='purchase_return' then 'purchase' else 'sale' end;
    if v_kind='sale' then
      select * into v_sale from public.si_sales where id=v_id and org_id=p_org; if not found or v_sale.status not in ('completed','partial_return') then raise exception 'This sale cannot be returned or voided'; end if;
      v_method:=case when v_sale.payment_method='credit' then 'cash' else v_sale.payment_method end;
    else
      select * into v_purchase from public.si_purchases where id=v_id and org_id=p_org; if not found or v_purchase.status not in ('received','partial_return') then raise exception 'Only received goods can be returned'; end if; v_method:=v_purchase.payment_method;
    end if;
    if p_action='sale_void' then select jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity-returned_quantity) order by product_id) into v_lines from public.si_sale_items where sale_id=v_id and org_id=p_org and returned_quantity<quantity;
    else v_lines:=p_payload->'lines'; end if;
    perform si_private.assert_lines(v_lines); v_return:=gen_random_uuid();
    for v_line in select value from jsonb_array_elements(v_lines) loop
      v_qty:=si_private.int_field(v_line,'quantity',1,1000000);
      select * into v_product from public.si_products where id=(v_line->>'product_id')::uuid and org_id=p_org; if not found then raise exception 'Product not found'; end if;
      if v_kind='sale' then
        select * into v_si from public.si_sale_items where sale_id=v_id and product_id=v_product.id and org_id=p_org; if not found or v_qty>v_si.quantity-v_si.returned_quantity then raise exception 'Return exceeds sold quantity'; end if;
        if v_product.stock+v_qty>1000000 then raise exception 'Stock exceeds limit'; end if;
        v_line_total:=floor(v_si.line_total_minor::numeric*(v_si.returned_quantity+v_qty)/v_si.quantity)-floor(v_si.line_total_minor::numeric*v_si.returned_quantity/v_si.quantity);
        v_t:=floor(v_si.tax_minor::numeric*(v_si.returned_quantity+v_qty)/v_si.quantity)-floor(v_si.tax_minor::numeric*v_si.returned_quantity/v_si.quantity); v_cost:=v_qty*v_si.unit_cost_minor;
        update public.si_sale_items set returned_quantity=returned_quantity+v_qty where id=v_si.id and org_id=p_org;
        update public.si_products set stock=stock+v_qty,cost_minor=round((stock::numeric*cost_minor+v_cost)/(stock+v_qty)),active=true,updated_at=now() where id=v_product.id and org_id=p_org returning * into v_product;
        v_delta:=v_qty; v_price:=v_si.unit_cost_minor;
      else
        select * into v_pi from public.si_purchase_items where purchase_id=v_id and product_id=v_product.id and org_id=p_org; if not found or v_qty>v_pi.quantity-v_pi.returned_quantity then raise exception 'Return exceeds received quantity'; end if;
        if v_product.stock<v_qty then raise exception 'Insufficient stock to return to supplier'; end if;
        v_line_total:=v_qty*v_pi.unit_cost_minor; v_t:=0; v_cost:=v_qty*v_product.cost_minor;
        update public.si_purchase_items set returned_quantity=returned_quantity+v_qty where id=v_pi.id and org_id=p_org;
        update public.si_products set stock=stock-v_qty,updated_at=now() where id=v_product.id and org_id=p_org returning * into v_product; v_delta:=-v_qty; v_price:=v_product.cost_minor;
      end if;
      v_return_total:=v_return_total+v_line_total; v_return_tax:=v_return_tax+v_t; v_return_cost:=v_return_cost+v_cost;
      v_return_lines:=v_return_lines||jsonb_build_array(jsonb_build_object('product_id',v_product.id,'name',v_product.name,'quantity',v_qty,'value_minor',v_line_total));
      insert into public.si_stock_movements(org_id,product_id,kind,source_id,request_id,delta,balance_after,unit_cost_minor,reason,created_by) values(p_org,v_product.id,v_kind||'_return',v_id,p_key,v_delta,v_product.stock,v_price,v_reason,auth.uid());
    end loop;
    if v_kind='sale' then
      v_refund:=greatest(v_sale.paid_minor-v_sale.refunded_minor-(v_sale.total_minor-v_sale.returned_minor-v_return_total),0);
      update public.si_sales set returned_minor=returned_minor+v_return_total,refunded_minor=refunded_minor+v_refund,status=case when p_action='sale_void' then 'voided' when not exists(select 1 from public.si_sale_items where sale_id=v_id and returned_quantity<quantity) then 'returned' else 'partial_return' end where id=v_id and org_id=p_org returning * into v_sale; v_result:=to_jsonb(v_sale);
    else
      v_refund:=greatest(v_purchase.paid_minor-v_purchase.refunded_minor-(v_purchase.total_minor-v_purchase.returned_minor-v_return_total),0);
      update public.si_purchases set returned_minor=returned_minor+v_return_total,refunded_minor=refunded_minor+v_refund,status=case when not exists(select 1 from public.si_purchase_items where purchase_id=v_id and returned_quantity<quantity) then 'returned' else 'partial_return' end where id=v_id and org_id=p_org returning * into v_purchase; v_result:=to_jsonb(v_purchase);
    end if;
    insert into public.si_returns(id,org_id,source_id,source_type,reason,value_minor,refund_minor,tax_minor,cost_minor,lines,created_by) values(v_return,p_org,v_id,v_kind,v_reason,v_return_total,v_refund,v_return_tax,v_return_cost,v_return_lines,auth.uid());
    if v_refund>0 then insert into public.si_payments(org_id,source_id,source_type,kind,amount_minor,method,created_by) values(p_org,v_id,v_kind,'refund',v_refund,v_method,auth.uid()); end if;
    v_result:=v_result||jsonb_build_object('last_refund_minor',v_refund,'last_return_minor',v_return_total);
  elsif p_action='payment_add' then
    v_kind:=si_private.text_field(p_payload,'source_type',20,true); v_method:=si_private.text_field(p_payload,'method',20,true); if v_method not in ('cash','card','mobile') then raise exception 'Invalid payment method'; end if;
    if v_kind='sale' then
      select * into v_sale from public.si_sales where id=v_id and org_id=p_org; if not found or v_sale.status not in ('completed','partial_return') then raise exception 'Sale cannot accept payment'; end if;
      v_due:=v_sale.total_minor-v_sale.returned_minor-v_sale.paid_minor+v_sale.refunded_minor; v_paid:=si_private.int_field(p_payload,'amount_minor',1,v_due);
      update public.si_sales set paid_minor=paid_minor+v_paid where id=v_id and org_id=p_org returning * into v_sale; v_result:=to_jsonb(v_sale);
    elsif v_kind='purchase' and v_role in ('owner','manager') then
      select * into v_purchase from public.si_purchases where id=v_id and org_id=p_org; if not found or v_purchase.status not in ('received','partial_return') then raise exception 'Purchase cannot accept payment'; end if;
      v_due:=v_purchase.total_minor-v_purchase.returned_minor-v_purchase.paid_minor+v_purchase.refunded_minor; v_paid:=si_private.int_field(p_payload,'amount_minor',1,v_due);
      update public.si_purchases set paid_minor=paid_minor+v_paid where id=v_id and org_id=p_org returning * into v_purchase; v_result:=to_jsonb(v_purchase);
    else raise exception 'Payment not permitted' using errcode='42501'; end if;
    insert into public.si_payments(org_id,source_id,source_type,kind,amount_minor,method,created_by) values(p_org,v_id,v_kind,'payment',v_paid,v_method,auth.uid());
  elsif p_action='stock_adjust' then
    v_delta:=si_private.int_field(p_payload,'delta',-1000000,1000000); if v_delta=0 then raise exception 'Adjustment cannot be zero'; end if;
    v_reason:=si_private.text_field(p_payload,'reason',2000,true); if length(v_reason)<3 then raise exception 'Give a reason of at least 3 characters'; end if;
    select * into v_product from public.si_products where id=v_id and org_id=p_org and active; if not found then raise exception 'Active product not found'; end if;
    if v_product.stock+v_delta not between 0 and 1000000 then raise exception 'Adjustment would produce invalid stock'; end if;
    update public.si_products set stock=stock+v_delta,updated_at=now() where id=v_id and org_id=p_org returning * into v_product;
    insert into public.si_stock_movements(org_id,product_id,kind,source_id,request_id,delta,balance_after,unit_cost_minor,reason,created_by) values(p_org,v_id,'adjustment',p_key,p_key,v_delta,v_product.stock,v_product.cost_minor,v_reason,auth.uid()); v_result:=to_jsonb(v_product);
  elsif p_action='settings_save' then
    v_name:=si_private.text_field(p_payload,'name',160,true); v_kind:=si_private.text_field(p_payload,'currency',3,true); v_method:=si_private.text_field(p_payload,'timezone',80,true);
    if not exists(select 1 from pg_timezone_names where name=v_method) then raise exception 'Invalid timezone'; end if;
    if v_kind<>v_org.currency and (exists(select 1 from public.si_sales where org_id=p_org) or exists(select 1 from public.si_purchases where org_id=p_org)) then raise exception 'Currency is locked after the first transaction'; end if;
    update public.si_organizations set name=v_name,currency=v_kind,timezone=v_method,address=si_private.text_field(p_payload,'address',500),phone=si_private.text_field(p_payload,'phone',60),receipt_footer=si_private.text_field(p_payload,'receipt_footer',500),tax_bps=si_private.int_field(p_payload,'tax_bps',0,10000,0) where id=p_org returning * into v_org; v_id:=p_org; v_result:=to_jsonb(v_org);
  elsif p_action='member_save' then
    v_email:=lower(si_private.text_field(p_payload,'email',254,true)); v_kind:=si_private.text_field(p_payload,'role',20,true); v_active:=coalesce((p_payload->>'active')::boolean,true);
    if v_kind not in ('owner','manager','cashier') then raise exception 'Invalid role'; end if;
    select id into v_user from auth.users where lower(email)=v_email; if not found then raise exception 'Ask this colleague to register an account first'; end if;
    if exists(select 1 from public.si_members where org_id=p_org and user_id=v_user and role='owner' and active) and (v_kind<>'owner' or not v_active) and (select count(*) from public.si_members where org_id=p_org and role='owner' and active)<2 then raise exception 'A workspace must retain at least one active owner'; end if;
    insert into public.si_members(org_id,user_id,email,role,active) values(p_org,v_user,v_email,v_kind,v_active) on conflict(org_id,user_id) do update set role=excluded.role,active=excluded.active;
    v_id:=v_user; v_result:=jsonb_build_object('user_id',v_user,'role',v_kind,'active',v_active);
  else raise exception 'Unknown inventory action'; end if;
  insert into public.si_audit(org_id,action,entity_id,details,created_by) values(p_org,p_action,v_id,jsonb_build_object('request_id',p_key),auth.uid());
  insert into si_private.requests(org_id,request_id,action,payload,result,created_by) values(p_org,p_key,p_action,p_payload,v_result,auth.uid()); return v_result;
end $$;
revoke all on function si_private.int_field(jsonb,text,bigint,bigint,bigint),si_private.text_field(jsonb,text,integer,boolean),si_private.assert_lines(jsonb) from public,anon,authenticated;
revoke all on function public.si_bootstrap(text,text,text,uuid),public.si_mutate(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.si_bootstrap(text,text,text,uuid),public.si_mutate(uuid,text,jsonb,uuid) to authenticated;
commit;
