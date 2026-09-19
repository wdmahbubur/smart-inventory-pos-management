-- Attention ordering is applied before pagination, not to a browser page.
create function public.get_low_stock(p_filters jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); result jsonb; lim integer:=coalesce((p_filters->>'size')::integer,20); offst integer:=(coalesce((p_filters->>'page')::integer,1)-1)*lim;
begin
 perform private.validate_filters(p_filters);
 perform private.keys(p_filters,array[]::text[],array['q','page','size','category']);
 with records as (
  select p.*,c.name category_name,b.quantity,greatest(p.minimum_stock-b.quantity,0) shortage,
  case when b.quantity=0 then 'out_of_stock' else 'low_stock' end stock_status,
  b.quantity::numeric*p.reference_cost_paisa stock_value_paisa
  from public.products p join public.categories c on c.id=p.category_id join public.inventory_balances b on b.product_id=p.id
  where p.store_id=sid and p.archived_at is null and (b.quantity=0 or b.quantity<p.minimum_stock)
 ), filtered as (
  select * from records where (coalesce(p_filters->>'q','')='' or position(lower(p_filters->>'q') in lower(name||' '||sku))>0)
  and (nullif(p_filters->>'category','') is null or category_id=(p_filters->>'category')::uuid)
 ), page as (select * from filtered order by (quantity=0) desc,lower(name),id limit lim offset offst)
 select jsonb_build_object('rows',coalesce((select jsonb_agg(to_jsonb(page)) from page),'[]'),'total',(select count(*) from filtered),'page',offst/lim+1,'size',lim,
 'out_of_stock',(select count(*) from records where quantity=0),'low_stock',(select count(*) from records where quantity>0),'attention_count',(select count(*) from records)) into result;
 return private.safe_json(result);
end $$;
revoke all on function public.get_low_stock(jsonb) from public,anon;
grant execute on function public.get_low_stock(jsonb) to authenticated;
