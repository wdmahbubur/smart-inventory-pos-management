-- Dedicated Supabase project only. No changes to auth users, existing apps, or global defaults.
-- Integer minor currency units; stock is whole units. See docs/BUSINESS_RULES.md.
begin;
create schema if not exists si_private;
revoke all on schema si_private from public, anon;
create table public.si_organizations (
  id uuid primary key default gen_random_uuid(), bootstrap_key uuid not null unique,
  name text not null check (length(btrim(name)) between 1 and 160),
  currency text not null default 'BDT' check (currency in ('BDT','USD','EUR','GBP','INR','CAD','AUD')),
  timezone text not null default 'Asia/Dhaka', address text not null default '' check(length(address)<=500),
  phone text not null default '' check(length(phone)<=60), receipt_footer text not null default 'Thank you for shopping with us!' check(length(receipt_footer)<=500),
  tax_bps integer not null default 0 check(tax_bps between 0 and 10000), created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create table public.si_members (
  org_id uuid not null references public.si_organizations(id), user_id uuid not null references auth.users(id), email text not null,
  role text not null check(role in ('owner','manager','cashier')), active boolean not null default true, created_at timestamptz not null default now(), primary key(org_id,user_id)
);
create index si_members_user on public.si_members(user_id,org_id) where active;
create table public.si_categories (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id),
  name text not null check(length(btrim(name)) between 1 and 80), active boolean not null default true,
  created_at timestamptz not null default now(), unique(id,org_id), unique(org_id,name)
);
create table public.si_contacts (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), kind text not null check(kind in ('customer','supplier')),
  name text not null check(length(btrim(name)) between 1 and 160), email text not null default '' check(length(email)<=254), phone text not null default '' check(length(phone)<=60),
  address text not null default '' check(length(address)<=500), active boolean not null default true, created_at timestamptz not null default now(), unique(id,org_id)
);
create index si_contacts_org_kind on public.si_contacts(org_id,kind,name);
create table public.si_products (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), category_id uuid,
  name text not null check(length(btrim(name)) between 1 and 160), sku text not null check(length(btrim(sku)) between 1 and 80),
  barcode text check(barcode is null or length(barcode) between 1 and 80), unit text not null default 'pcs' check(length(unit) between 1 and 20),
  price_minor bigint not null check(price_minor between 0 and 1000000000000), cost_minor bigint not null default 0 check(cost_minor between 0 and 1000000000000),
  stock integer not null default 0 check(stock between 0 and 1000000), reorder_level integer not null default 5 check(reorder_level between 0 and 1000000),
  low_stock boolean generated always as (stock <= reorder_level) stored,
  search_text text generated always as (lower(name || ' ' || sku || ' ' || coalesce(barcode,''))) stored,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,org_id), unique(org_id,sku), foreign key(category_id,org_id) references public.si_categories(id,org_id)
);
create unique index si_products_barcode on public.si_products(org_id,barcode) where barcode is not null;
create index si_products_org_category on public.si_products(org_id,category_id);
create index si_products_org_active on public.si_products(org_id,active,name);
create table public.si_purchases (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), supplier_id uuid,
  reference text not null default ('PO-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  status text not null default 'draft' check(status in ('draft','received','cancelled','partial_return','returned')), notes text not null default '' check(length(notes)<=2000),
  total_minor bigint not null default 0 check(total_minor between 0 and 1000000000000), paid_minor bigint not null default 0 check(paid_minor>=0),
  returned_minor bigint not null default 0 check(returned_minor>=0), refunded_minor bigint not null default 0 check(refunded_minor>=0),
  payment_method text not null default 'cash' check(payment_method in ('cash','card','mobile')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), received_at timestamptz,
  check(paid_minor <= total_minor and returned_minor <= total_minor and refunded_minor <= paid_minor),
  unique(id,org_id), unique(org_id,reference), foreign key(supplier_id,org_id) references public.si_contacts(id,org_id)
);
create index si_purchases_org_date on public.si_purchases(org_id,created_at desc);
create index si_purchases_supplier on public.si_purchases(org_id,supplier_id);
create table public.si_purchase_items (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), purchase_id uuid not null, product_id uuid not null,
  product_name text not null, sku text not null, quantity integer not null check(quantity between 1 and 1000000), returned_quantity integer not null default 0 check(returned_quantity between 0 and quantity),
  unit_cost_minor bigint not null check(unit_cost_minor between 0 and 1000000000000), unique(purchase_id,product_id),
  foreign key(purchase_id,org_id) references public.si_purchases(id,org_id), foreign key(product_id,org_id) references public.si_products(id,org_id)
);
create index si_purchase_items_org_product on public.si_purchase_items(org_id,product_id);
create table public.si_sales (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), customer_id uuid,
  reference text not null default ('SL-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  status text not null default 'completed' check(status in ('completed','partial_return','returned','voided')),
  subtotal_minor bigint not null check(subtotal_minor between 0 and 1000000000000), discount_minor bigint not null check(discount_minor between 0 and subtotal_minor),
  tax_bps integer not null check(tax_bps between 0 and 10000), tax_minor bigint not null check(tax_minor>=0), total_minor bigint not null check(total_minor between 0 and 1000000000000),
  paid_minor bigint not null check(paid_minor between 0 and total_minor), change_minor bigint not null default 0 check(change_minor>=0),
  returned_minor bigint not null default 0 check(returned_minor between 0 and total_minor), refunded_minor bigint not null default 0 check(refunded_minor between 0 and paid_minor),
  payment_method text not null check(payment_method in ('cash','card','mobile','credit')), receipt_snapshot jsonb not null, notes text not null default '' check(length(notes)<=2000),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), check(total_minor=subtotal_minor-discount_minor+tax_minor),
  unique(id,org_id), unique(org_id,reference), foreign key(customer_id,org_id) references public.si_contacts(id,org_id)
);
create index si_sales_org_date on public.si_sales(org_id,created_at desc);
create index si_sales_customer on public.si_sales(org_id,customer_id);
create table public.si_sale_items (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), sale_id uuid not null, product_id uuid not null,
  product_name text not null, sku text not null, quantity integer not null check(quantity between 1 and 1000000), returned_quantity integer not null default 0 check(returned_quantity between 0 and quantity),
  unit_price_minor bigint not null check(unit_price_minor between 0 and 1000000000000), unit_cost_minor bigint not null check(unit_cost_minor between 0 and 1000000000000),
  discount_minor bigint not null check(discount_minor>=0), tax_minor bigint not null check(tax_minor>=0), line_total_minor bigint not null check(line_total_minor>=0), unique(sale_id,product_id),
  foreign key(sale_id,org_id) references public.si_sales(id,org_id), foreign key(product_id,org_id) references public.si_products(id,org_id)
);
create index si_sale_items_org_product on public.si_sale_items(org_id,product_id);
create table public.si_stock_movements (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), product_id uuid not null,
  kind text not null check(kind in ('purchase','sale','purchase_return','sale_return','adjustment')), source_id uuid not null, request_id uuid not null,
  delta integer not null check(delta<>0), balance_after integer not null check(balance_after between 0 and 1000000), unit_cost_minor bigint not null check(unit_cost_minor>=0),
  reason text not null default '' check(length(reason)<=2000), created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique(org_id,request_id,product_id), foreign key(product_id,org_id) references public.si_products(id,org_id)
);
create index si_stock_org_date on public.si_stock_movements(org_id,created_at desc);
create index si_stock_org_product on public.si_stock_movements(org_id,product_id);
create table public.si_payments (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), source_id uuid not null, source_type text not null check(source_type in ('sale','purchase')),
  kind text not null check(kind in ('payment','refund')), amount_minor bigint not null check(amount_minor between 1 and 1000000000000), method text not null check(method in ('cash','card','mobile')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index si_payments_org_source on public.si_payments(org_id,source_type,source_id);
create index si_payments_org_date on public.si_payments(org_id,created_at);
create table public.si_returns (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), source_id uuid not null,
  source_type text not null check(source_type in ('sale','purchase')), reason text not null, value_minor bigint not null check(value_minor>=0), refund_minor bigint not null check(refund_minor>=0),
  tax_minor bigint not null default 0 check(tax_minor>=0), cost_minor bigint not null default 0 check(cost_minor>=0), lines jsonb not null, created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index si_returns_org_date on public.si_returns(org_id,created_at);
create index si_returns_org_source on public.si_returns(org_id,source_type,source_id);
create table public.si_audit (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.si_organizations(id), action text not null, entity_id uuid,
  details jsonb not null default '{}', created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create index si_audit_org_date on public.si_audit(org_id,created_at desc);
create table si_private.requests (
  org_id uuid not null references public.si_organizations(id), request_id uuid not null, action text not null, payload jsonb not null, result jsonb not null,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), primary key(org_id,request_id)
);
create table si_private.ai_limits (
  org_id uuid not null references public.si_organizations(id), user_id uuid not null references auth.users(id), hour timestamptz not null,
  calls integer not null default 0, primary key(org_id,user_id,hour)
);
create function si_private.member_role(p_org uuid) returns text language sql stable security definer set search_path='' as $$
  select role from public.si_members where org_id=p_org and user_id=auth.uid() and active;
$$;
revoke all on function si_private.member_role(uuid) from public,anon;
grant usage on schema si_private to authenticated;
grant execute on function si_private.member_role(uuid) to authenticated;
do $$ declare t text; begin
  foreach t in array array['si_organizations','si_members','si_categories','si_contacts','si_products','si_purchases','si_purchase_items','si_sales','si_sale_items','si_stock_movements','si_payments','si_returns','si_audit'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public,anon,authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
  end loop;
end $$;
create policy si_org_read on public.si_organizations for select to authenticated using (si_private.member_role(id) is not null);
create policy si_member_read on public.si_members for select to authenticated using (si_private.member_role(org_id)='owner' or (user_id=auth.uid() and active));
create policy si_category_read on public.si_categories for select to authenticated using (si_private.member_role(org_id) is not null);
create policy si_product_read on public.si_products for select to authenticated using (si_private.member_role(org_id) is not null);
create policy si_contact_read on public.si_contacts for select to authenticated using (si_private.member_role(org_id) is not null and (kind='customer' or si_private.member_role(org_id) in ('owner','manager')));
create policy si_purchase_read on public.si_purchases for select to authenticated using (si_private.member_role(org_id) in ('owner','manager'));
create policy si_purchase_item_read on public.si_purchase_items for select to authenticated using (si_private.member_role(org_id) in ('owner','manager'));
create policy si_sale_read on public.si_sales for select to authenticated using (si_private.member_role(org_id) is not null);
create policy si_sale_item_read on public.si_sale_items for select to authenticated using (si_private.member_role(org_id) is not null);
create policy si_stock_read on public.si_stock_movements for select to authenticated using (si_private.member_role(org_id) in ('owner','manager'));
create policy si_payment_read on public.si_payments for select to authenticated using (si_private.member_role(org_id) is not null and (source_type='sale' or si_private.member_role(org_id) in ('owner','manager')));
create policy si_return_read on public.si_returns for select to authenticated using (si_private.member_role(org_id) is not null and (source_type='sale' or si_private.member_role(org_id) in ('owner','manager')));
create policy si_audit_read on public.si_audit for select to authenticated using (si_private.member_role(org_id) in ('owner','manager'));
revoke all on all tables in schema si_private from public,anon,authenticated;
commit;
