-- Every catalog mutation takes the same store-first lock as receipt/checkout.
create function public.catalog_mutate(p_kind text,p_action text,p_payload jsonb,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.stores:=private.store_lock(); op text:='catalog:'||p_kind||':'||p_action;
 replay jsonb; entity_id uuid; result jsonb; v_name text; v_version integer;
 product public.products; category public.categories; supplier public.suppliers;
 cat_id uuid; v_sku text; v_unit text; has_reference boolean; qty integer;
 v_icon text; v_color text; v_cost bigint; v_price bigint; v_min integer;
begin
 if p_kind not in ('product','category','supplier','store') or p_action not in ('save','delete','archive','restore') then perform private.fail('VALIDATION_ERROR'); end if;
 replay:=private.replay(s.id,op,p_request_id,p_payload); if replay is not null then return replay; end if;
 if p_kind='store' then
  if p_action<>'save' then perform private.fail('VALIDATION_ERROR'); end if;
  perform private.keys(p_payload,array['name','display_name'],array['name','display_name','phone','address']);
  update public.stores set name=private.text_value(p_payload,'name',2,100),phone=private.text_value(p_payload,'phone',0,32),address=private.text_value(p_payload,'address',0,500) where id=s.id;
  update public.profiles set display_name=private.text_value(p_payload,'display_name',2,100),updated_at=clock_timestamp() where id=auth.uid();
  return private.finish(s.id,op,p_request_id,p_payload,jsonb_build_object('id',s.id));
 end if;
 if p_action='save' then
  if p_kind='product' then
   perform private.keys(p_payload,array['name','sku','category_id','unit','reference_cost_paisa','selling_price_paisa','minimum_stock'],array['id','expected_version','name','sku','category_id','unit','reference_cost_paisa','selling_price_paisa','minimum_stock','description','icon_key','color_key']);
  elsif p_kind='category' then
   perform private.keys(p_payload,array['name'],array['id','expected_version','name','description','icon_key','color_key']);
  else
   perform private.keys(p_payload,array['name'],array['id','expected_version','name','phone','address']);
  end if;
 else
  perform private.keys(p_payload,array['id','expected_version'],array['id','expected_version']);
 end if;
 entity_id:=(p_payload->>'id')::uuid;
 if entity_id is not null then
  v_version:=private.int_value(p_payload,'expected_version',1,2147483647)::integer;
  if p_kind='product' then
   select * into product from public.products where store_id=s.id and id=entity_id for update;
   if not found then perform private.fail('NOT_FOUND'); end if;
   if product.version<>v_version then perform private.fail('VERSION_CONFLICT'); end if;
  elsif p_kind='category' then
   select * into category from public.categories where store_id=s.id and id=entity_id for update;
   if not found then perform private.fail('NOT_FOUND'); end if;
   if category.version<>v_version then perform private.fail('VERSION_CONFLICT'); end if;
  else
   select * into supplier from public.suppliers where store_id=s.id and id=entity_id for update;
   if not found then perform private.fail('NOT_FOUND'); end if;
   if supplier.version<>v_version then perform private.fail('VERSION_CONFLICT'); end if;
  end if;
 end if;
 if p_action<>'save' and entity_id is null then perform private.fail('VALIDATION_ERROR'); end if;
 if p_kind='product' then
  if entity_id is not null then
   select quantity into qty from public.inventory_balances where store_id=s.id and product_id=entity_id for update;
   has_reference:=exists(select 1 from public.purchase_items where store_id=s.id and product_id=entity_id) or exists(select 1 from public.sale_items where store_id=s.id and product_id=entity_id);
  end if;
  if p_action='save' then
   v_name:=private.text_value(p_payload,'name',1,150);
   v_sku:=upper(private.text_value(p_payload,'sku',1,64)); v_unit:=private.text_value(p_payload,'unit',1,16);
   if v_sku !~ '^[A-Z0-9._-]{1,64}$' or v_unit not in ('piece','bottle','pack','carton','bag') then perform private.fail('VALIDATION_ERROR'); end if;
   if has_reference and (product.sku<>v_sku or product.unit<>v_unit) then perform private.fail('IDENTITY_IMMUTABLE'); end if;
   if exists(select 1 from public.products where store_id=s.id and sku=v_sku and id is distinct from entity_id) then perform private.fail('SKU_EXISTS'); end if;
   cat_id:=(p_payload->>'category_id')::uuid;
   if not exists(select 1 from public.categories where store_id=s.id and id=cat_id) then perform private.fail('NOT_FOUND'); end if;
   v_cost:=private.int_value(p_payload,'reference_cost_paisa',0,1000000000);
   v_price:=private.int_value(p_payload,'selling_price_paisa',1,1000000000);
   v_min:=private.int_value(p_payload,'minimum_stock',0,1000000000)::integer;
   v_icon:=coalesce(private.text_value(p_payload,'icon_key',0,16),'package');
   v_color:=coalesce(private.text_value(p_payload,'color_key',0,16),'emerald');
   if entity_id is null then
    insert into public.products(store_id,name,sku,category_id,unit,reference_cost_paisa,selling_price_paisa,minimum_stock,description,icon_key,color_key)
    values(s.id,v_name,v_sku,cat_id,v_unit,v_cost,v_price,v_min,private.text_value(p_payload,'description',0,1000),v_icon,v_color) returning id,version into entity_id,v_version;
    insert into public.inventory_balances(store_id,product_id,quantity) values(s.id,entity_id,0);
   else
    update public.products set name=v_name,sku=v_sku,category_id=cat_id,unit=v_unit,reference_cost_paisa=v_cost,selling_price_paisa=v_price,minimum_stock=v_min,description=private.text_value(p_payload,'description',0,1000),icon_key=v_icon,color_key=v_color,version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
   end if;
  elsif p_action='delete' then
   if qty<>0 then perform private.fail('STOCK_NOT_ZERO'); end if;
   if has_reference then perform private.fail('REFERENCE_IN_USE'); end if;
   delete from public.inventory_balances where product_id=entity_id;
   delete from public.products where id=entity_id;
  elsif p_action='archive' then
   if qty<>0 then perform private.fail('STOCK_NOT_ZERO'); end if;
   if exists(select 1 from public.purchase_items i join public.purchases p on p.id=i.purchase_id where i.product_id=entity_id and p.status='draft') then perform private.fail('DRAFT_IN_USE'); end if;
   update public.products set archived_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
  else
   update public.products set archived_at=null,version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
  end if;
 elsif p_kind='category' then
  if p_action not in ('save','delete') then perform private.fail('VALIDATION_ERROR'); end if;
  if p_action='delete' then
   if exists(select 1 from public.products where store_id=s.id and category_id=entity_id) then perform private.fail('REFERENCE_IN_USE'); end if;
   delete from public.categories where id=entity_id;
  else
   v_name:=private.text_value(p_payload,'name',1,80);
   if exists(select 1 from public.categories where store_id=s.id and lower(btrim(name))=lower(v_name) and id is distinct from entity_id) then perform private.fail('CATEGORY_EXISTS'); end if;
   v_icon:=coalesce(private.text_value(p_payload,'icon_key',0,16),'package'); v_color:=coalesce(private.text_value(p_payload,'color_key',0,16),'emerald');
   if entity_id is null then
    insert into public.categories(store_id,name,description,icon_key,color_key) values(s.id,v_name,private.text_value(p_payload,'description',0,1000),v_icon,v_color) returning id,version into entity_id,v_version;
   else
    update public.categories set name=v_name,description=private.text_value(p_payload,'description',0,1000),icon_key=v_icon,color_key=v_color,version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
   end if;
  end if;
 else
  if p_action='save' then
   v_name:=private.text_value(p_payload,'name',1,150);
   if entity_id is null then
    insert into public.suppliers(store_id,name,phone,address) values(s.id,v_name,private.text_value(p_payload,'phone',0,32),private.text_value(p_payload,'address',0,500)) returning id,version into entity_id,v_version;
   else
    update public.suppliers set name=v_name,phone=private.text_value(p_payload,'phone',0,32),address=private.text_value(p_payload,'address',0,500),version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
   end if;
  elsif p_action='delete' then
   if exists(select 1 from public.purchases where store_id=s.id and supplier_id=entity_id) then perform private.fail('REFERENCE_IN_USE'); end if;
   delete from public.suppliers where id=entity_id;
  elsif p_action='archive' then
   if exists(select 1 from public.purchases where store_id=s.id and supplier_id=entity_id and status='draft') then perform private.fail('DRAFT_IN_USE'); end if;
   update public.suppliers set archived_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
  else
   update public.suppliers set archived_at=null,version=version+1,updated_at=clock_timestamp() where id=entity_id returning version into v_version;
  end if;
 end if;
 result:=jsonb_build_object('id',entity_id,'version',v_version);
 return private.finish(s.id,op,p_request_id,p_payload,result);
end $$;
revoke all on function public.catalog_mutate(text,text,jsonb,uuid) from public,anon;
grant execute on function public.catalog_mutate(text,text,jsonb,uuid) to authenticated;
