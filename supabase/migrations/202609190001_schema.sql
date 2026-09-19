-- Smart Inventory v1: BDT money is integer poisha; owner APIs are read-only except RPC.
create schema if not exists private;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 display_name text not null check (char_length(btrim(display_name)) between 2 and 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.stores (
 id uuid primary key default gen_random_uuid(),
 owner_user_id uuid not null unique references auth.users(id) on delete restrict,
 name text not null check (char_length(btrim(name)) between 2 and 100),
 phone text check (char_length(phone)<=32), address text check (char_length(address)<=500),
 currency text not null default 'BDT' check(currency='BDT'),
 timezone text not null default 'Asia/Dhaka' check(timezone='Asia/Dhaka'),
 next_purchase_number bigint not null default 1 check(next_purchase_number>0),
 next_sale_number bigint not null default 1 check(next_sale_number>0),
 data_revision bigint not null default 0 check(data_revision>=0),
 is_demo boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.categories (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null check(char_length(btrim(name)) between 1 and 80),
 description text check(char_length(description)<=1000),
 icon_key text not null default 'package' check(icon_key in ('package','bottle','bag','bread','milk','store')),
 color_key text not null default 'emerald' check(color_key in ('emerald','amber','blue','rose','violet','sand')),
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id)
);
create unique index categories_name_unique on public.categories(store_id,lower(btrim(name)));
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null check(char_length(btrim(name)) between 1 and 150),
 phone text check(char_length(phone)<=32), address text check(char_length(address)<=500),
 archived_at timestamptz, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(store_id,id)
);
create index suppliers_lookup on public.suppliers(store_id,archived_at,name,id);
create table public.products (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 name text not null check(char_length(btrim(name)) between 1 and 150),
 sku text not null check(sku ~ '^[A-Z0-9._-]{1,64}$'),
 category_id uuid not null,
 unit text not null check(unit in ('piece','bottle','pack','carton','bag')),
 reference_cost_paisa bigint not null check(reference_cost_paisa between 0 and 1000000000),
 selling_price_paisa bigint not null check(selling_price_paisa between 1 and 1000000000),
 minimum_stock integer not null check(minimum_stock between 0 and 1000000000),
 description text check(char_length(description)<=1000),
 icon_key text not null default 'package' check(icon_key in ('package','bottle','bag','bread','milk','store')),
 color_key text not null default 'emerald' check(color_key in ('emerald','amber','blue','rose','violet','sand')),
 archived_at timestamptz, version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id), unique(store_id,sku),
 foreign key(store_id,category_id) references public.categories(store_id,id) on delete restrict
);
create index products_lookup on public.products(store_id,archived_at,category_id,name,id);
create table public.inventory_balances (
 store_id uuid not null, product_id uuid primary key,
 quantity integer not null default 0 check(quantity between 0 and 1000000000),
 updated_at timestamptz not null default now(), unique(store_id,product_id),
 foreign key(store_id,product_id) references public.products(store_id,id) on delete restrict
);
create table public.purchases (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 number text not null, supplier_id uuid not null,
 status text not null default 'draft' check(status in ('draft','received')),
 purchase_date date not null,
 supplier_reference text check(char_length(supplier_reference)<=150), note text check(char_length(note)<=1000),
 total_paisa bigint not null check(total_paisa between 0 and 1000000000000),
 supplier_name_snapshot text, supplier_phone_snapshot text, supplier_address_snapshot text,
 store_name_snapshot text, store_phone_snapshot text, store_address_snapshot text,
 created_by uuid not null references auth.users(id), received_by uuid references auth.users(id), received_at timestamptz,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(store_id,id), unique(store_id,number),
 foreign key(store_id,supplier_id) references public.suppliers(store_id,id) on delete restrict,
 check ((status='draft' and received_at is null and received_by is null) or
        (status='received' and received_at is not null and received_by is not null and supplier_name_snapshot is not null and store_name_snapshot is not null))
);
create index purchases_posting on public.purchases(store_id,status,received_at desc,id);
create index purchases_activity on public.purchases(store_id,status,updated_at desc,id);
create index purchases_supplier on public.purchases(store_id,supplier_id,received_at);
create table public.purchase_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null, purchase_id uuid not null, product_id uuid not null,
 line_position integer not null check(line_position between 1 and 100),
 quantity integer not null check(quantity between 1 and 1000000),
 unit_cost_paisa bigint not null check(unit_cost_paisa between 0 and 1000000000),
 line_total_paisa bigint not null check(line_total_paisa=quantity::bigint*unit_cost_paisa and line_total_paisa<=1000000000000),
 product_name_snapshot text, sku_snapshot text, unit_snapshot text,
 unique(store_id,id), unique(store_id,product_id,id), unique(purchase_id,product_id), unique(purchase_id,line_position),
 foreign key(store_id,purchase_id) references public.purchases(store_id,id) on delete restrict,
 foreign key(store_id,product_id) references public.products(store_id,id) on delete restrict
);
create index purchase_items_product on public.purchase_items(store_id,product_id);
create table public.sales (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id), number text not null,
 status text not null default 'completed' check(status='completed'),
 subtotal_paisa bigint not null check(subtotal_paisa between 1 and 1000000000000),
 discount_paisa bigint not null check(discount_paisa>=0 and discount_paisa<subtotal_paisa),
 total_paisa bigint not null check(total_paisa=subtotal_paisa-discount_paisa),
 payment_method text not null default 'cash' check(payment_method='cash'),
 cash_received_paisa bigint not null check(cash_received_paisa between total_paisa and 1000000000000),
 change_paisa bigint not null check(change_paisa=cash_received_paisa-total_paisa),
 customer_name text check(char_length(customer_name)<=150), customer_phone text check(char_length(customer_phone)<=32),
 store_name_snapshot text not null, store_phone_snapshot text, store_address_snapshot text,
 cashier_id uuid not null references auth.users(id), cashier_name_snapshot text not null,
 completed_at timestamptz not null default now(), created_at timestamptz not null default now(),
 unique(store_id,id), unique(store_id,number)
);
create index sales_posting on public.sales(store_id,completed_at desc,id);
create table public.sale_items (
 id uuid primary key default gen_random_uuid(), store_id uuid not null, sale_id uuid not null, product_id uuid not null,
 line_position integer not null check(line_position between 1 and 100), quantity integer not null check(quantity between 1 and 1000000),
 unit_price_paisa bigint not null check(unit_price_paisa between 1 and 1000000000),
 line_gross_paisa bigint not null check(line_gross_paisa=quantity::bigint*unit_price_paisa and line_gross_paisa<=1000000000000),
 product_name_snapshot text not null, sku_snapshot text not null, unit_snapshot text not null,
 unique(store_id,id), unique(store_id,product_id,id), unique(sale_id,product_id), unique(sale_id,line_position),
 foreign key(store_id,sale_id) references public.sales(store_id,id) on delete restrict,
 foreign key(store_id,product_id) references public.products(store_id,id) on delete restrict
);
create index sale_items_product on public.sale_items(store_id,product_id);
create table public.stock_movements (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique,
 store_id uuid not null, product_id uuid not null,
 source_type text not null check(source_type in ('purchase','sale')),
 purchase_item_id uuid, sale_item_id uuid,
 quantity_delta integer not null check(quantity_delta<>0),
 quantity_before integer not null check(quantity_before between 0 and 1000000000),
 quantity_after integer not null check(quantity_after between 0 and 1000000000 and quantity_after=quantity_before+quantity_delta),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
 foreign key(store_id,product_id) references public.products(store_id,id),
 foreign key(store_id,product_id,purchase_item_id) references public.purchase_items(store_id,product_id,id),
 foreign key(store_id,product_id,sale_item_id) references public.sale_items(store_id,product_id,id),
 check ((source_type='purchase' and purchase_item_id is not null and sale_item_id is null and quantity_delta>0) or
        (source_type='sale' and sale_item_id is not null and purchase_item_id is null and quantity_delta<0))
);
create unique index movement_purchase_once on public.stock_movements(purchase_item_id) where purchase_item_id is not null;
create unique index movement_sale_once on public.stock_movements(sale_item_id) where sale_item_id is not null;
create index movements_store_sequence on public.stock_movements(store_id,sequence desc);
create index movements_product_sequence on public.stock_movements(store_id,product_id,sequence desc);
create table private.operation_requests (
 store_id uuid not null references public.stores(id), operation_type text not null, request_id uuid not null,
 payload_hash text not null, result jsonb not null, completed_at timestamptz not null default now(),
 primary key(store_id,operation_type,request_id)
);
create table public.ai_insights (
 id uuid primary key default gen_random_uuid(), store_id uuid not null references public.stores(id),
 language text not null check(language in ('bn','en')), provider text not null, model text not null, prompt_version text not null,
 facts_hash text not null, store_data_revision bigint not null, business_date date not null,
 facts_snapshot jsonb not null, content jsonb not null, generated_at timestamptz not null default now()
);
create index insights_cache on public.ai_insights(store_id,language,store_data_revision,business_date,generated_at desc);
create table private.ai_request_windows (
 store_id uuid not null references public.stores(id), window_start timestamptz not null, request_count integer not null check(request_count between 0 and 10),
 primary key(store_id,window_start)
);
create table private.ai_leases (
 store_id uuid not null references public.stores(id), language text not null check(language in ('bn','en')),
 lease_id uuid not null, expires_at timestamptz not null, metadata jsonb not null,
 primary key(store_id,language)
);

-- The owner may SELECT their records, but cannot bypass business RPCs with table writes.
alter table public.stores enable row level security;
create policy stores_owner_read on public.stores for select to authenticated using(owner_user_id=(select auth.uid()));
alter table public.profiles enable row level security;
create policy profiles_owner_read on public.profiles for select to authenticated using(id=(select auth.uid()));
do $$ declare t text; begin
 foreach t in array array['categories','suppliers','products','inventory_balances','purchases','purchase_items','sales','sale_items','stock_movements','ai_insights'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('create policy owner_read on public.%I for select to authenticated using(store_id in (select id from public.stores where owner_user_id=(select auth.uid())))',t);
 end loop;
end $$;
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles,public.stores,public.categories,public.suppliers,public.products,public.inventory_balances,public.purchases,public.purchase_items,public.sales,public.sale_items,public.stock_movements,public.ai_insights to authenticated;
revoke all on all tables in schema private from public,anon,authenticated;
revoke all on all sequences in schema public from anon,authenticated;

create function private.fail(code text) returns void language plpgsql set search_path='' as $$ begin raise exception using message=code,errcode='P0001'; end $$;
create function private.keys(doc jsonb, required text[], allowed text[]) returns void language plpgsql immutable set search_path='' as $$
begin
 if doc is null or jsonb_typeof(doc)<>'object' or not doc ?& required or exists(select 1 from jsonb_object_keys(doc) k where not k=any(allowed)) then perform private.fail('VALIDATION_ERROR'); end if;
end $$;
create function private.int_value(doc jsonb, key text, lo bigint, hi bigint) returns bigint language plpgsql immutable set search_path='' as $$
declare txt text:=doc->>key; v numeric;
begin
 if txt is null or txt !~ '^[0-9]{1,18}$' then perform private.fail('VALIDATION_ERROR'); end if;
 v:=txt::numeric;
 if v<lo or v>hi then perform private.fail('VALIDATION_ERROR'); end if;
 return v::bigint;
end $$;
create function private.text_value(doc jsonb,key text,lo integer,hi integer) returns text language plpgsql immutable set search_path='' as $$
declare v text:=nullif(btrim(doc->>key),'');
begin
 if (doc ? key and doc->key<>'null'::jsonb and jsonb_typeof(doc->key)<>'string') or (v is null and lo>0) or char_length(v)<lo or char_length(v)>hi then perform private.fail('VALIDATION_ERROR'); end if;
 return v;
end $$;
create function private.store_lock() returns public.stores language plpgsql security definer set search_path='' as $$
declare s public.stores;
begin
 if auth.uid() is null then perform private.fail('UNAUTHENTICATED'); end if;
 select * into s from public.stores where owner_user_id=auth.uid() for update;
 if not found then perform private.fail('NOT_FOUND'); end if;
 return s;
end $$;
create function private.store_id() returns uuid language plpgsql stable security definer set search_path='' as $$
declare sid uuid;
begin
 if auth.uid() is null then perform private.fail('UNAUTHENTICATED'); end if;
 select id into sid from public.stores where owner_user_id=auth.uid();
 if sid is null then perform private.fail('NOT_FOUND'); end if;
 return sid;
end $$;
create function private.payload_hash(payload jsonb) returns text language sql immutable set search_path='' as $$
 select encode(extensions.digest(convert_to(payload::text,'UTF8'),'sha256'),'hex')
$$;
create function private.replay(sid uuid,op text,rid uuid,payload jsonb) returns jsonb language plpgsql set search_path='' as $$
declare r private.operation_requests;
begin
 if rid is null then perform private.fail('VALIDATION_ERROR'); end if;
 select * into r from private.operation_requests where store_id=sid and operation_type=op and request_id=rid;
 if found then
  if r.payload_hash<>private.payload_hash(payload) then perform private.fail('IDEMPOTENCY_CONFLICT'); end if;
  return r.result;
 end if;
 return null;
end $$;
create function private.finish(sid uuid,op text,rid uuid,payload jsonb,result jsonb) returns jsonb language plpgsql set search_path='' as $$
begin
 insert into private.operation_requests(store_id,operation_type,request_id,payload_hash,result) values(sid,op,rid,private.payload_hash(payload),result);
 update public.stores set data_revision=data_revision+1,updated_at=clock_timestamp() where id=sid;
 return result;
end $$;
create function public.get_operation_result(p_operation text,p_request_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r jsonb; sid uuid:=private.store_id();
begin
 select result into r from private.operation_requests where store_id=sid and operation_type=p_operation and request_id=p_request_id;
 return jsonb_build_object('committed',r is not null,'result',r);
end $$;

-- Initial identity is Auth-owned and idempotent. No demo rows or balances are inserted.
create function public.create_owner_store() returns jsonb language plpgsql security definer set search_path='' as $$
declare meta jsonb; sid uuid; display text; store_name text;
begin
 if auth.uid() is null then perform private.fail('UNAUTHENTICATED'); end if;
 select raw_user_meta_data into meta from auth.users where id=auth.uid() for update;
 if not found then perform private.fail('UNAUTHENTICATED'); end if;
 display:=private.text_value(meta,'full_name',2,100); store_name:=private.text_value(meta,'store_name',2,100);
 insert into public.profiles(id,display_name) values(auth.uid(),display) on conflict(id) do nothing;
 insert into public.stores(owner_user_id,name) values(auth.uid(),store_name) on conflict(owner_user_id) do nothing;
 select id into sid from public.stores where owner_user_id=auth.uid();
 return jsonb_build_object('id',sid);
end $$;
create function private.on_auth_user_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name) values(new.id,private.text_value(new.raw_user_meta_data,'full_name',2,100));
 insert into public.stores(owner_user_id,name) values(new.id,private.text_value(new.raw_user_meta_data,'store_name',2,100));
 return new;
end $$;
create trigger smart_inventory_on_signup after insert on auth.users for each row execute function private.on_auth_user_created();

-- Posted documents cannot be rewritten, even by a future accidentally over-granted API.
create function private.immutable_row() returns trigger language plpgsql set search_path='' as $$ begin perform private.fail('POSTED_IMMUTABLE'); return null; end $$;
create trigger immutable_sales before update or delete on public.sales for each row execute function private.immutable_row();
create trigger immutable_sale_items before update or delete on public.sale_items for each row execute function private.immutable_row();
create trigger immutable_movements before update or delete on public.stock_movements for each row execute function private.immutable_row();
create function private.guard_purchase() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='received' then perform private.fail('POSTED_IMMUTABLE'); end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger guard_purchase before update or delete on public.purchases for each row execute function private.guard_purchase();
create function private.guard_purchase_item() returns trigger language plpgsql set search_path='' as $$
declare pid uuid;
begin
 pid:=case when tg_op='DELETE' then old.purchase_id else new.purchase_id end;
 if exists(select 1 from public.purchases where id=pid and status='received') then perform private.fail('POSTED_IMMUTABLE'); end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger guard_purchase_item before insert or update or delete on public.purchase_items for each row execute function private.guard_purchase_item();
create function private.guard_movement_source() returns trigger language plpgsql set search_path='' as $$
begin
 if new.source_type='purchase' and not exists(select 1 from public.purchase_items i join public.purchases p on p.id=i.purchase_id where i.id=new.purchase_item_id and p.status='received' and i.quantity=new.quantity_delta and new.created_at=p.received_at) then perform private.fail('INVALID_MOVEMENT_SOURCE'); end if;
 if new.source_type='sale' and not exists(select 1 from public.sale_items i join public.sales s on s.id=i.sale_id where i.id=new.sale_item_id and s.status='completed' and i.quantity=-new.quantity_delta and new.created_at=s.completed_at) then perform private.fail('INVALID_MOVEMENT_SOURCE'); end if;
 return new;
end $$;
create trigger guard_movement_source before insert on public.stock_movements for each row execute function private.guard_movement_source();
create function private.check_balance_ledger() returns trigger language plpgsql set search_path='' as $$
declare pid uuid:=coalesce(new.product_id,old.product_id); balance bigint; ledger numeric;
begin
 select quantity into balance from public.inventory_balances where product_id=pid;
 select coalesce(sum(quantity_delta),0) into ledger from public.stock_movements where product_id=pid;
 if (balance is not null and balance<>ledger) or (balance is null and ledger<>0) then perform private.fail('LEDGER_MISMATCH'); end if;
 return null;
end $$;
create constraint trigger balance_matches_ledger after insert or update or delete on public.inventory_balances deferrable initially deferred for each row execute function private.check_balance_ledger();
create constraint trigger ledger_matches_balance after insert on public.stock_movements deferrable initially deferred for each row execute function private.check_balance_ledger();
revoke all on all functions in schema private from public,anon,authenticated;
revoke all on function public.create_owner_store(),public.get_operation_result(text,uuid) from public,anon;
grant execute on function public.create_owner_store(),public.get_operation_result(text,uuid) to authenticated;
