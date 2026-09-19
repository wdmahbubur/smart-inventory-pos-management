-- The only application stock-writing operations. All validation failures abort the transaction.
create function public.write_purchase(p_payload jsonb,p_request_id uuid,p_receive boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.stores:=private.store_lock(); op text:=case when p_receive then 'receive_purchase' else 'save_purchase_draft' end;
 replay jsonb; pid uuid; doc public.purchases; supplier public.suppliers; product public.products;
 line jsonb; line_row record; item_id uuid; qty integer; before_qty integer; cost bigint; total numeric:=0;
 invoice_date date; stamp timestamptz; pos integer:=0; result jsonb; document_number text;
begin
 replay:=private.replay(s.id,op,p_request_id,p_payload); if replay is not null then return replay; end if;
 perform private.keys(p_payload,array['supplier_id','purchase_date','items'],array['id','expected_version','supplier_id','purchase_date','supplier_reference','note','items']);
 pid:=(p_payload->>'id')::uuid;
 if pid is not null then
  select * into doc from public.purchases where store_id=s.id and id=pid for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  if doc.status='received' then return jsonb_build_object('id',doc.id,'number',doc.number,'status','received','already_received',true); end if;
  if doc.version<>private.int_value(p_payload,'expected_version',1,2147483647) then perform private.fail('VERSION_CONFLICT'); end if;
 end if;
 select * into supplier from public.suppliers where store_id=s.id and id=(p_payload->>'supplier_id')::uuid and archived_at is null;
 if not found then perform private.fail('NOT_FOUND'); end if;
 if (p_payload->>'purchase_date') !~ '^\d{4}-\d{2}-\d{2}$' then perform private.fail('VALIDATION_ERROR'); end if;
 invoice_date:=(p_payload->>'purchase_date')::date;
 if invoice_date is null or invoice_date>(clock_timestamp() at time zone 'Asia/Dhaka')::date then perform private.fail('VALIDATION_ERROR'); end if;
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 100 then perform private.fail('VALIDATION_ERROR'); end if;
 if (select count(distinct value->>'product_id') from jsonb_array_elements(p_payload->'items'))<>jsonb_array_length(p_payload->'items') then perform private.fail('VALIDATION_ERROR'); end if;
 -- Deterministic product lock ordering, shared with checkout/catalog operations.
 for line in select value from jsonb_array_elements(p_payload->'items') order by (value->>'product_id')::uuid loop
  perform private.keys(line,array['product_id','quantity','unit_cost_paisa'],array['product_id','quantity','unit_cost_paisa']);
  select * into product from public.products where store_id=s.id and id=(line->>'product_id')::uuid and archived_at is null for update;
  if not found then perform private.fail('NOT_FOUND'); end if;
  qty:=private.int_value(line,'quantity',1,1000000)::integer; cost:=private.int_value(line,'unit_cost_paisa',0,1000000000);
  select quantity into before_qty from public.inventory_balances where store_id=s.id and product_id=product.id for update;
  if before_qty is null then perform private.fail('LEDGER_MISMATCH'); end if;
  if p_receive and before_qty::bigint+qty>1000000000 then perform private.fail('STOCK_LIMIT'); end if;
  total:=total+qty::numeric*cost;
  if total>1000000000000 then perform private.fail('VALIDATION_ERROR'); end if;
 end loop;
 stamp:=clock_timestamp();
 if pid is null then
  document_number:='P-'||lpad(s.next_purchase_number::text,greatest(4,length(s.next_purchase_number::text)),'0');
  update public.stores set next_purchase_number=next_purchase_number+1 where id=s.id;
  insert into public.purchases(store_id,number,supplier_id,purchase_date,supplier_reference,note,total_paisa,created_by,created_at,updated_at)
  values(s.id,document_number,supplier.id,invoice_date,private.text_value(p_payload,'supplier_reference',0,150),private.text_value(p_payload,'note',0,1000),total::bigint,auth.uid(),stamp,stamp) returning * into doc;
  pid:=doc.id;
 else
  delete from public.purchase_items where purchase_id=pid;
  update public.purchases set supplier_id=supplier.id,purchase_date=invoice_date,supplier_reference=private.text_value(p_payload,'supplier_reference',0,150),note=private.text_value(p_payload,'note',0,1000),total_paisa=total::bigint,version=version+1,updated_at=stamp where id=pid returning * into doc;
 end if;
 for line in select value from jsonb_array_elements(p_payload->'items') loop
  pos:=pos+1; qty:=(line->>'quantity')::integer; cost:=(line->>'unit_cost_paisa')::bigint;
  select * into product from public.products where id=(line->>'product_id')::uuid and store_id=s.id;
  insert into public.purchase_items(store_id,purchase_id,product_id,line_position,quantity,unit_cost_paisa,line_total_paisa,product_name_snapshot,sku_snapshot,unit_snapshot)
  values(s.id,pid,product.id,pos,qty,cost,qty::bigint*cost,product.name,product.sku,product.unit);
 end loop;
 if p_receive then
  update public.purchases set status='received',received_at=stamp,received_by=auth.uid(),supplier_name_snapshot=supplier.name,supplier_phone_snapshot=supplier.phone,supplier_address_snapshot=supplier.address,store_name_snapshot=s.name,store_phone_snapshot=s.phone,store_address_snapshot=s.address where id=pid returning * into doc;
  for line_row in select * from public.purchase_items where purchase_id=pid order by line_position loop
   select quantity into before_qty from public.inventory_balances where product_id=line_row.product_id;
   update public.inventory_balances set quantity=quantity+line_row.quantity,updated_at=stamp where product_id=line_row.product_id;
   insert into public.stock_movements(store_id,product_id,source_type,purchase_item_id,quantity_delta,quantity_before,quantity_after,created_by,created_at)
   values(s.id,line_row.product_id,'purchase',line_row.id,line_row.quantity,before_qty,before_qty+line_row.quantity,auth.uid(),stamp);
  end loop;
 end if;
 result:=jsonb_build_object('id',pid,'number',doc.number,'status',doc.status,'version',doc.version,'total_paisa',total::bigint::text);
 return private.finish(s.id,op,p_request_id,p_payload,result);
end $$;

create function public.delete_purchase_draft(p_id uuid,p_expected_version integer,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.stores:=private.store_lock(); doc public.purchases; payload jsonb:=jsonb_build_object('id',p_id,'expected_version',p_expected_version); replay jsonb;
begin
 replay:=private.replay(s.id,'delete_purchase_draft',p_request_id,payload); if replay is not null then return replay; end if;
 select * into doc from public.purchases where store_id=s.id and id=p_id for update;
 if not found then perform private.fail('NOT_FOUND'); end if;
 if doc.status<>'draft' then perform private.fail('POSTED_IMMUTABLE'); end if;
 if p_expected_version is null or doc.version<>p_expected_version then perform private.fail('VERSION_CONFLICT'); end if;
 delete from public.purchase_items where purchase_id=p_id;
 delete from public.purchases where id=p_id;
 return private.finish(s.id,'delete_purchase_draft',p_request_id,payload,jsonb_build_object('id',p_id,'deleted',true));
end $$;

create function public.complete_sale(p_payload jsonb,p_request_id uuid)
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
  insert into public.sale_items(store_id,sale_id,product_id,line_position,quantity,unit_price_paisa,line_gross_paisa,product_name_snapshot,sku_snapshot,unit_snapshot)
  values(s.id,sale_id,product.id,pos,qty,product.selling_price_paisa,qty::bigint*product.selling_price_paisa,product.name,product.sku,product.unit) returning id into item_id;
  select quantity into before_qty from public.inventory_balances where product_id=product.id;
  update public.inventory_balances set quantity=quantity-qty,updated_at=stamp where product_id=product.id;
  insert into public.stock_movements(store_id,product_id,source_type,sale_item_id,quantity_delta,quantity_before,quantity_after,created_by,created_at)
  values(s.id,product.id,'sale',item_id,-qty,before_qty,before_qty-qty,auth.uid(),stamp);
 end loop;
 result:=jsonb_build_object('id',sale_id,'number',document_number,'total_paisa',total::text,'change_paisa',(tender-total)::text);
 return private.finish(s.id,'complete_sale',p_request_id,p_payload,result);
end $$;
revoke all on function public.write_purchase(jsonb,uuid,boolean),public.delete_purchase_draft(uuid,integer,uuid),public.complete_sale(jsonb,uuid) from public,anon;
grant execute on function public.write_purchase(jsonb,uuid,boolean),public.delete_purchase_draft(uuid,integer,uuid),public.complete_sale(jsonb,uuid) to authenticated;
