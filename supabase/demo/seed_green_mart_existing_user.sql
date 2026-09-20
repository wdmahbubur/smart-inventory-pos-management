-- Seed an isolated hosted demo tenant for the already-created demo Auth user.
-- This is intentionally kept outside supabase/migrations so normal installs remain empty.
do $seed$
declare
  v_user uuid;
  v_existing_products integer;
  v_beverages jsonb;
  v_snacks jsonb;
  v_grocery jsonb;
  v_personal jsonb;
  v_supplier1 jsonb;
  v_supplier2 jsonb;
  v_supplier3 jsonb;
  v_coke jsonb;
  v_sprite jsonb;
  v_water jsonb;
  v_chips jsonb;
  v_biscuit jsonb;
  v_milk jsonb;
  v_rice jsonb;
  v_oil jsonb;
  v_shampoo jsonb;
  v_soap jsonb;
begin
  select id into v_user
  from auth.users
  where lower(email)=lower('demo@smartinventory.app')
    and email_confirmed_at is not null;

  if v_user is null then
    raise exception 'DEMO_CONFIRMED_USER_REQUIRED';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_user::text,'role','authenticated','email','demo@smartinventory.app')::text,
    true
  );

  perform public.create_owner_store();

  select count(*)::integer into v_existing_products
  from public.products p
  join public.stores s on s.id=p.store_id
  where s.owner_user_id=v_user;

  if v_existing_products <> 0 then
    raise exception 'DEMO_STORE_MUST_BE_EMPTY';
  end if;

  perform public.catalog_mutate(
    'store','save',
    jsonb_build_object(
      'name','Green Mart Grocery',
      'display_name','Mahin Ahmed',
      'phone','01712-345678',
      'address','Dhanmondi, Dhaka'
    ),
    gen_random_uuid()
  );

  select public.catalog_mutate('category','save',
    '{"name":"Beverages","description":"Cold drinks, water and dairy","icon_key":"bottle","color_key":"blue"}'::jsonb,
    gen_random_uuid()) into v_beverages;
  select public.catalog_mutate('category','save',
    '{"name":"Snacks","description":"Quick snacks and biscuits","icon_key":"package","color_key":"amber"}'::jsonb,
    gen_random_uuid()) into v_snacks;
  select public.catalog_mutate('category','save',
    '{"name":"Grocery","description":"Everyday pantry essentials","icon_key":"bag","color_key":"emerald"}'::jsonb,
    gen_random_uuid()) into v_grocery;
  select public.catalog_mutate('category','save',
    '{"name":"Personal Care","description":"Personal and household care","icon_key":"store","color_key":"violet"}'::jsonb,
    gen_random_uuid()) into v_personal;

  select public.catalog_mutate('supplier','save',
    '{"name":"Dhaka Wholesale Ltd","phone":"01711-223344","address":"Tejgaon Industrial Area, Dhaka"}'::jsonb,
    gen_random_uuid()) into v_supplier1;
  select public.catalog_mutate('supplier','save',
    '{"name":"FreshMart Distributors","phone":"01819-445566","address":"Kawran Bazar, Dhaka"}'::jsonb,
    gen_random_uuid()) into v_supplier2;
  select public.catalog_mutate('supplier','save',
    '{"name":"Daily Needs Supply","phone":"01912-778899","address":"Mirpur-1, Dhaka"}'::jsonb,
    gen_random_uuid()) into v_supplier3;

  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Coca-Cola 500ml','sku','COKE-500','category_id',v_beverages->>'id','unit','bottle','minimum_stock',8,'reference_cost_paisa','4500','selling_price_paisa','6000','description','Popular cold drink','icon_key','bottle','color_key','rose'),
    gen_random_uuid()) into v_coke;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Sprite 500ml','sku','SPRITE-500','category_id',v_beverages->>'id','unit','bottle','minimum_stock',6,'reference_cost_paisa','4200','selling_price_paisa','6000','description','Lemon-lime soft drink','icon_key','bottle','color_key','emerald'),
    gen_random_uuid()) into v_sprite;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Mineral Water 1L','sku','WATER-1L','category_id',v_beverages->>'id','unit','bottle','minimum_stock',10,'reference_cost_paisa','1800','selling_price_paisa','3000','description','Everyday bottled water','icon_key','bottle','color_key','blue'),
    gen_random_uuid()) into v_water;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Potato Chips 25g','sku','CHIPS-25','category_id',v_snacks->>'id','unit','pack','minimum_stock',8,'reference_cost_paisa','2000','selling_price_paisa','3500','description','Fast-moving snack pack','icon_key','package','color_key','amber'),
    gen_random_uuid()) into v_chips;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Biscuits Family Pack','sku','BISCUIT-FAM','category_id',v_snacks->>'id','unit','pack','minimum_stock',5,'reference_cost_paisa','5500','selling_price_paisa','8000','description','Family-size biscuit pack','icon_key','package','color_key','sand'),
    gen_random_uuid()) into v_biscuit;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Milk 1L','sku','MILK-1L','category_id',v_grocery->>'id','unit','bottle','minimum_stock',6,'reference_cost_paisa','7800','selling_price_paisa','9500','description','Fresh milk carton','icon_key','milk','color_key','blue'),
    gen_random_uuid()) into v_milk;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Miniket Rice 5kg','sku','RICE-5KG','category_id',v_grocery->>'id','unit','bag','minimum_stock',4,'reference_cost_paisa','36000','selling_price_paisa','42000','description','5kg premium rice bag','icon_key','bag','color_key','emerald'),
    gen_random_uuid()) into v_rice;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Soybean Oil 2L','sku','OIL-2L','category_id',v_grocery->>'id','unit','bottle','minimum_stock',4,'reference_cost_paisa','34000','selling_price_paisa','39000','description','2 litre cooking oil','icon_key','bottle','color_key','amber'),
    gen_random_uuid()) into v_oil;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Shampoo 180ml','sku','SHAMPOO-180','category_id',v_personal->>'id','unit','bottle','minimum_stock',3,'reference_cost_paisa','21000','selling_price_paisa','26000','description','Daily-use shampoo','icon_key','bottle','color_key','violet'),
    gen_random_uuid()) into v_shampoo;
  select public.catalog_mutate('product','save',
    jsonb_build_object('name','Bath Soap 100g','sku','SOAP-100','category_id',v_personal->>'id','unit','piece','minimum_stock',6,'reference_cost_paisa','5000','selling_price_paisa','6500','description','Bathing soap bar','icon_key','package','color_key','rose'),
    gen_random_uuid()) into v_soap;

  perform public.write_purchase(
    jsonb_build_object(
      'supplier_id',v_supplier1->>'id','purchase_date','2026-09-17',
      'supplier_reference','DW-0917','note','Opening beverage and snack replenishment',
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_coke->>'id','quantity',36,'unit_cost_paisa','4500'),
        jsonb_build_object('product_id',v_sprite->>'id','quantity',24,'unit_cost_paisa','4200'),
        jsonb_build_object('product_id',v_water->>'id','quantity',30,'unit_cost_paisa','1800'),
        jsonb_build_object('product_id',v_chips->>'id','quantity',24,'unit_cost_paisa','2000')
      )
    ),gen_random_uuid(),true);

  perform public.write_purchase(
    jsonb_build_object(
      'supplier_id',v_supplier2->>'id','purchase_date','2026-09-18',
      'supplier_reference','FM-0918','note','Weekly grocery delivery',
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_biscuit->>'id','quantity',10,'unit_cost_paisa','5500'),
        jsonb_build_object('product_id',v_milk->>'id','quantity',12,'unit_cost_paisa','7800'),
        jsonb_build_object('product_id',v_rice->>'id','quantity',8,'unit_cost_paisa','36000'),
        jsonb_build_object('product_id',v_oil->>'id','quantity',8,'unit_cost_paisa','34000')
      )
    ),gen_random_uuid(),true);

  perform public.write_purchase(
    jsonb_build_object(
      'supplier_id',v_supplier3->>'id','purchase_date','2026-09-19',
      'supplier_reference','DNS-0919','note','Personal care restock',
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_shampoo->>'id','quantity',6,'unit_cost_paisa','21000'),
        jsonb_build_object('product_id',v_soap->>'id','quantity',12,'unit_cost_paisa','5000')
      )
    ),gen_random_uuid(),true);

  perform public.write_purchase(
    jsonb_build_object(
      'supplier_id',v_supplier2->>'id','purchase_date','2026-09-20',
      'supplier_reference','FM-DRAFT','note','Draft: planned top-up for next delivery',
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_coke->>'id','quantity',12,'unit_cost_paisa','4500'),
        jsonb_build_object('product_id',v_milk->>'id','quantity',6,'unit_cost_paisa','8000')
      )
    ),gen_random_uuid(),false);

  perform public.complete_sale(
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_coke->>'id','quantity',2,'expected_price_paisa','6000','expected_version',1),
        jsonb_build_object('product_id',v_chips->>'id','quantity',1,'expected_price_paisa','3500','expected_version',1),
        jsonb_build_object('product_id',v_milk->>'id','quantity',1,'expected_price_paisa','9500','expected_version',1)
      ),
      'discount_paisa','1000','cash_received_paisa','50000',
      'customer_name','Rahim Uddin','customer_phone','01700-100001'
    ),gen_random_uuid());

  perform public.complete_sale(
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_rice->>'id','quantity',1,'expected_price_paisa','42000','expected_version',1),
        jsonb_build_object('product_id',v_oil->>'id','quantity',1,'expected_price_paisa','39000','expected_version',1),
        jsonb_build_object('product_id',v_water->>'id','quantity',2,'expected_price_paisa','3000','expected_version',1)
      ),
      'discount_paisa','2000','cash_received_paisa','100000',
      'customer_name','Nusrat Jahan','customer_phone','01800-100002'
    ),gen_random_uuid());

  perform public.complete_sale(
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_sprite->>'id','quantity',2,'expected_price_paisa','6000','expected_version',1),
        jsonb_build_object('product_id',v_soap->>'id','quantity',2,'expected_price_paisa','6500','expected_version',1),
        jsonb_build_object('product_id',v_biscuit->>'id','quantity',1,'expected_price_paisa','8000','expected_version',1)
      ),
      'discount_paisa','0','cash_received_paisa','50000',
      'customer_name','Walk-in customer'
    ),gen_random_uuid());

  perform public.complete_sale(
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_coke->>'id','quantity',8,'expected_price_paisa','6000','expected_version',1),
        jsonb_build_object('product_id',v_water->>'id','quantity',10,'expected_price_paisa','3000','expected_version',1),
        jsonb_build_object('product_id',v_chips->>'id','quantity',8,'expected_price_paisa','3500','expected_version',1)
      ),
      'discount_paisa','1000','cash_received_paisa','120000',
      'customer_name','Nearby Office','customer_phone','01900-100003'
    ),gen_random_uuid());

  perform public.complete_sale(
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_milk->>'id','quantity',4,'expected_price_paisa','9500','expected_version',1),
        jsonb_build_object('product_id',v_shampoo->>'id','quantity',6,'expected_price_paisa','26000','expected_version',1),
        jsonb_build_object('product_id',v_rice->>'id','quantity',2,'expected_price_paisa','42000','expected_version',1)
      ),
      'discount_paisa','2000','cash_received_paisa','300000',
      'customer_name','Mizan Store','customer_phone','01700-100004'
    ),gen_random_uuid());

  perform public.complete_sale(
    jsonb_build_object(
      'items',jsonb_build_array(
        jsonb_build_object('product_id',v_sprite->>'id','quantity',6,'expected_price_paisa','6000','expected_version',1),
        jsonb_build_object('product_id',v_biscuit->>'id','quantity',5,'expected_price_paisa','8000','expected_version',1),
        jsonb_build_object('product_id',v_oil->>'id','quantity',3,'expected_price_paisa','39000','expected_version',1),
        jsonb_build_object('product_id',v_soap->>'id','quantity',4,'expected_price_paisa','6500','expected_version',1),
        jsonb_build_object('product_id',v_coke->>'id','quantity',4,'expected_price_paisa','6000','expected_version',1),
        jsonb_build_object('product_id',v_chips->>'id','quantity',8,'expected_price_paisa','3500','expected_version',1),
        jsonb_build_object('product_id',v_milk->>'id','quantity',2,'expected_price_paisa','9500','expected_version',1)
      ),
      'discount_paisa','3000','cash_received_paisa','300000',
      'customer_name','Evening walk-in sales'
    ),gen_random_uuid());
end
$seed$;
