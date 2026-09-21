-- Targeted indexes selected from the hosted performance advisor and actual query paths.
-- Avoid indexing low-selectivity audit columns or immutable movement FKs without a demonstrated read benefit.

create index if not exists products_store_category
  on public.products(store_id, category_id);

create index if not exists purchase_items_store_purchase
  on public.purchase_items(store_id, purchase_id);

create index if not exists sale_items_store_sale
  on public.sale_items(store_id, sale_id);
