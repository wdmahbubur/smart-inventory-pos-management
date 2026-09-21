-- Replace the snapshot-only AI context with bounded historical demand/margin signals.
-- Forecasts are deterministic decision-support calculations; AI may explain/prioritize them but cannot invent values or write data.
create or replace function public.get_insight_context()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare
 sid uuid:=private.store_id();
 w jsonb:=public.get_workspace();
 snap timestamptz:=private.business_clock(sid);
 business_day date:=(snap at time zone 'Asia/Dhaka')::date;
 forecast jsonb;
 facts jsonb;
begin
 with catalog as (
  select p.id,p.name,p.sku,p.unit,p.minimum_stock,p.selling_price_paisa,p.reference_cost_paisa,p.created_at,b.quantity
  from public.products p join public.inventory_balances b on b.store_id=p.store_id and b.product_id=p.id
  where p.store_id=sid and p.archived_at is null
 ),
 sale_lines as (
  select i.product_id,i.quantity,i.line_gross_paisa,i.line_cost_paisa,s.completed_at,
   (s.completed_at at time zone 'Asia/Dhaka')::date sale_day,
   (i.line_gross_paisa-i.line_cost_paisa-
    case when s.subtotal_paisa>0 then round(s.discount_paisa::numeric*i.line_gross_paisa/s.subtotal_paisa) else 0 end)::bigint product_profit_paisa
  from public.sale_items i join public.sales s on s.id=i.sale_id and s.store_id=i.store_id
  where i.store_id=sid and s.completed_at>=snap-interval '56 days' and s.completed_at<snap
 ),
 received as (
  select product_id,min(created_at) first_received_at
  from public.stock_movements where store_id=sid and source_type='purchase' group by product_id
 ),
 product_sales as (
  select product_id,
   coalesce(sum(quantity) filter(where completed_at>=snap-interval '7 days'),0)::integer units_7d,
   coalesce(sum(quantity) filter(where completed_at>=snap-interval '14 days' and completed_at<snap-interval '7 days'),0)::integer units_prev_7d,
   coalesce(sum(quantity) filter(where completed_at>=snap-interval '30 days'),0)::integer units_30d,
   count(distinct sale_day) filter(where completed_at>=snap-interval '30 days')::integer active_sale_days_30d,
   coalesce(sum(line_gross_paisa) filter(where completed_at>=snap-interval '30 days'),0)::bigint revenue_30d_paisa,
   coalesce(sum(product_profit_paisa) filter(where completed_at>=snap-interval '30 days'),0)::bigint profit_30d_paisa,
   max(completed_at) last_sale_at
  from sale_lines group by product_id
 ),
 days as (select generate_series((business_day-55)::timestamp,business_day::timestamp,interval '1 day')::date as calendar_day),
 daily as (
  select d.calendar_day,coalesce(sum(sl.quantity),0)::numeric units
  from days d left join sale_lines sl on sl.sale_day=d.calendar_day group by d.calendar_day
 ),
 weekday_stats as (
  select case when avg(units)>0 then greatest(.75::numeric,least(1.25::numeric,coalesce(avg(units) filter(where extract(isodow from calendar_day)=extract(isodow from business_day)),avg(units))/avg(units))) else 1::numeric end factor
  from daily
 ),
 base as (
  select c.*,coalesce(ps.units_7d,0) units_7d,coalesce(ps.units_prev_7d,0) units_prev_7d,coalesce(ps.units_30d,0) units_30d,
   coalesce(ps.active_sale_days_30d,0) active_sale_days_30d,coalesce(ps.revenue_30d_paisa,0) revenue_30d_paisa,coalesce(ps.profit_30d_paisa,0) profit_30d_paisa,
   ps.last_sale_at,r.first_received_at,(select factor from weekday_stats) weekday_factor,
   case when c.selling_price_paisa>0 then round(((c.selling_price_paisa-c.reference_cost_paisa)::numeric*100/c.selling_price_paisa),1) else 0 end margin_pct,
   case when ps.last_sale_at is not null then greatest(0,business_day-(ps.last_sale_at at time zone 'Asia/Dhaka')::date)
        when r.first_received_at is not null then greatest(0,business_day-(r.first_received_at at time zone 'Asia/Dhaka')::date)
        else null end days_without_sale,
   case when coalesce(ps.units_prev_7d,0)>0 then greatest(.5::numeric,least(1.5::numeric,coalesce(ps.units_7d,0)::numeric/ps.units_prev_7d))
        when coalesce(ps.units_7d,0)>0 then 1.15::numeric else 1::numeric end trend_ratio
  from catalog c left join product_sales ps on ps.product_id=c.id left join received r on r.product_id=c.id
 ),
 predicted as (
  select b.*,
   round((.65::numeric*(units_7d::numeric/7)+.35::numeric*(units_30d::numeric/30))*(.8::numeric+.2::numeric*trend_ratio)*weekday_factor,3) forecast_daily,
   case when units_prev_7d>0 then round(((units_7d::numeric/units_prev_7d)-1)*100)::integer when units_7d>0 then 100 else 0 end trend_pct
  from base b
 ),
 signals_raw as (
  select p.*,
   round(forecast_daily*7)::integer forecast_7d_units,
   case when forecast_daily>0 then round(quantity::numeric/forecast_daily,1) else null end stock_cover_days,
   greatest(ceil(greatest(minimum_stock::numeric,forecast_daily*14*1.2)-quantity),0)::integer suggested_restock_qty,
   case when quantity>0 and days_without_sale>=60 and margin_pct>=15 then greatest(0,least(15,floor(margin_pct-10)::integer))
        when quantity>0 and days_without_sale>=30 and margin_pct>=15 then greatest(0,least(10,floor(margin_pct-10)::integer))
        when quantity>0 and days_without_sale>=21 and margin_pct>=15 then greatest(0,least(5,floor(margin_pct-10)::integer)) else 0 end discount_opportunity_pct,
   case when units_30d>=20 and active_sale_days_30d>=8 then 'high' when units_30d>=5 and active_sale_days_30d>=3 then 'medium' else 'low' end confidence
  from predicted p
 ),
 signals as (
  select id,name,sku,unit,quantity,minimum_stock,selling_price_paisa::text selling_price_paisa,reference_cost_paisa::text reference_cost_paisa,
   units_7d,units_prev_7d,units_30d,active_sale_days_30d,revenue_30d_paisa::text revenue_30d_paisa,profit_30d_paisa::text profit_30d_paisa,
   trend_pct,forecast_7d_units,round(forecast_daily,2)::float8 forecast_daily_units,stock_cover_days::float8 stock_cover_days,suggested_restock_qty,
   days_without_sale,last_sale_at,margin_pct::float8 margin_pct,discount_opportunity_pct,
   greatest(round(selling_price_paisa::numeric*(100-discount_opportunity_pct)/100)-reference_cost_paisa,0)::bigint::text discounted_unit_profit_paisa,confidence
  from signals_raw
 )
 select jsonb_build_object(
  'lookback_days',56,'horizon_days',7,'weekday',trim(to_char(business_day,'Day')),'weekday_factor',round((select factor from weekday_stats),2)::float8,
  'total_units_7d',(select coalesce(sum(units_7d),0) from signals),'total_units_prev_7d',(select coalesce(sum(units_prev_7d),0) from signals),'total_units_30d',(select coalesce(sum(units_30d),0) from signals),'predicted_units_7d',(select coalesce(sum(forecast_7d_units),0) from signals),
  'top_sellers',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from signals where units_30d>0 order by units_30d desc,revenue_30d_paisa::bigint desc,id limit 8) x),'[]'::jsonb),
  'restock_candidates',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from signals where suggested_restock_qty>0 and forecast_7d_units>0 order by suggested_restock_qty desc,forecast_7d_units desc,id limit 8) x),'[]'::jsonb),
  'discount_candidates',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from signals where discount_opportunity_pct>=5 order by days_without_sale desc,quantity desc,id limit 8) x),'[]'::jsonb),
  'stagnant_products',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from signals where quantity>0 and days_without_sale>=30 order by days_without_sale desc,quantity desc,id limit 8) x),'[]'::jsonb),
  'profit_leaders',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from signals where profit_30d_paisa::bigint>0 order by profit_30d_paisa::bigint desc,units_30d desc,id limit 8) x),'[]'::jsonb)
 ) into forecast;

 facts:=jsonb_build_object('schema_version','inventory-facts-v2','snapshot_at',w->'snapshot_at','business_date',w->'business_date','timezone','Asia/Dhaka','currency','BDT','data_revision',w->'data_revision',
  'inventory',w->'inventory','sales',w->'sales','purchases',w->'purchases','forecast',forecast,
  'attention',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name','quantity',x->'quantity','minimum_stock',x->'minimum_stock','unit',x->'unit','shortage',x->'shortage')) from jsonb_array_elements(w->'attention') x),'[]'::jsonb),
  'attention_truncated',w->'attention_truncated','categories',w->'categories','highest_category',w->'highest_category',
  'definitions',jsonb_build_object(
   'forecast','Weighted 7-day and 30-day sales velocity, recent trend and a bounded store-wide weekday factor. Forecasts are estimates, not guarantees.',
   'restock','Targets 14 forecast days plus a 20% safety buffer, never below the configured minimum stock.',
   'discount','Only suggested for slow-moving stock when a 5-15% test discount retains at least roughly a 10% margin over current reference cost. Demand response is unknown.',
   'stagnant','Current stock with at least 30 days without a completed sale; never-sold items count from first received stock.',
   'product_profit','30-day line gross less captured product cost and a proportional share of order discount; operating expenses are excluded.'
  ));
 return jsonb_build_object('facts',facts,'facts_hash',private.payload_hash(facts-'snapshot_at'));
end $$;

create or replace function public.finish_insight(p_lease_id uuid,p_content jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 s public.stores:=private.store_lock(); lease private.ai_leases; snapshot jsonb; saved public.ai_insights; entry jsonb; key text;
begin
 select * into lease from private.ai_leases where store_id=s.id and lease_id=p_lease_id and expires_at>clock_timestamp();
 if not found then perform private.fail('AI_TIMEOUT'); end if;
 perform private.keys(p_content,array['summary_key','section_keys'],array['summary_key','section_keys']);
 if jsonb_typeof(p_content->'summary_key')<>'string' or jsonb_typeof(p_content->'section_keys')<>'array' then perform private.fail('AI_INVALID_OUTPUT'); end if;

 snapshot:=lease.metadata->'context'->'facts';
 if snapshot->>'schema_version'<>'inventory-facts-v2' then perform private.fail('AI_INVALID_OUTPUT'); end if;

 if lease.metadata->>'prompt_version'='inventory-insights-v1' then
  if p_content->>'summary_key' not in ('overview','attention','activity') then perform private.fail('AI_INVALID_OUTPUT'); end if;
  if jsonb_array_length(p_content->'section_keys') not between 1 and 3
     or (select count(distinct value) from jsonb_array_elements(p_content->'section_keys'))<>jsonb_array_length(p_content->'section_keys')
  then perform private.fail('AI_INVALID_OUTPUT'); end if;
  for entry in select value from jsonb_array_elements(p_content->'section_keys') loop
   key:=entry#>>'{}';
   if jsonb_typeof(entry)<>'string' or key not in ('stock','category','activity') then perform private.fail('AI_INVALID_OUTPUT'); end if;
   if key='category' and (snapshot->'highest_category'='null'::jsonb or snapshot->'highest_category' is null) then perform private.fail('AI_INVALID_OUTPUT'); end if;
  end loop;
 else
  if p_content->>'summary_key' not in ('growth','inventory','margin') then perform private.fail('AI_INVALID_OUTPUT'); end if;
  if jsonb_array_length(p_content->'section_keys') not between 1 and 4
     or (select count(distinct value) from jsonb_array_elements(p_content->'section_keys'))<>jsonb_array_length(p_content->'section_keys')
  then perform private.fail('AI_INVALID_OUTPUT'); end if;
  for entry in select value from jsonb_array_elements(p_content->'section_keys') loop
   key:=entry#>>'{}';
   if jsonb_typeof(entry)<>'string' or key not in ('demand','restock','discount','stagnant','profit') then perform private.fail('AI_INVALID_OUTPUT'); end if;
   if key='demand' and jsonb_array_length(coalesce(snapshot->'forecast'->'top_sellers','[]'::jsonb))=0 then perform private.fail('AI_INVALID_OUTPUT'); end if;
   if key='restock' and jsonb_array_length(coalesce(snapshot->'forecast'->'restock_candidates','[]'::jsonb))=0 then perform private.fail('AI_INVALID_OUTPUT'); end if;
   if key='discount' and jsonb_array_length(coalesce(snapshot->'forecast'->'discount_candidates','[]'::jsonb))=0 then perform private.fail('AI_INVALID_OUTPUT'); end if;
   if key='stagnant' and jsonb_array_length(coalesce(snapshot->'forecast'->'stagnant_products','[]'::jsonb))=0 then perform private.fail('AI_INVALID_OUTPUT'); end if;
   if key='profit' and jsonb_array_length(coalesce(snapshot->'forecast'->'profit_leaders','[]'::jsonb))=0 then perform private.fail('AI_INVALID_OUTPUT'); end if;
  end loop;
 end if;

 insert into public.ai_insights(store_id,language,provider,model,prompt_version,facts_hash,store_data_revision,business_date,facts_snapshot,content,generated_at)
 values(s.id,lease.language,lease.metadata->>'provider',lease.metadata->>'model',lease.metadata->>'prompt_version',lease.metadata->'context'->>'facts_hash',(snapshot->>'data_revision')::bigint,(snapshot->>'business_date')::date,snapshot,p_content,clock_timestamp()) returning * into saved;
 delete from private.ai_leases where store_id=s.id and lease_id=p_lease_id;
 delete from public.ai_insights where store_id=s.id and language=lease.language and id in (
  select id from public.ai_insights where store_id=s.id and language=lease.language order by generated_at desc,id desc offset 20
 );
 return private.safe_json(to_jsonb(saved));
end $$;

revoke all on function public.get_insight_context(),public.finish_insight(uuid,jsonb) from public,anon;
grant execute on function public.get_insight_context(),public.finish_insight(uuid,jsonb) to authenticated;
