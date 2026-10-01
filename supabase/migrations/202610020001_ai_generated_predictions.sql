-- Additive v3 AI workflow. Existing v1/v2 RPCs remain for rolling deployments.
-- Observed data -> mandatory external model call in Next.js -> validated saved prediction.
-- No business tables, posting rules, stock quantities or existing insights are rewritten.
create function public.get_prediction_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 sid uuid:=private.store_id(); stamp timestamptz:=private.business_clock(sid);
 day_date date:=(stamp at time zone 'Asia/Dhaka')::date;
 day_start timestamptz:=day_date::timestamp at time zone 'Asia/Dhaka';
 w jsonb:=public.get_workspace(); facts jsonb;
begin
 with active as (
  select p.id,p.name,p.sku,p.unit,p.minimum_stock,p.selling_price_paisa,p.reference_cost_paisa,p.created_at,b.quantity
  from public.products p join public.inventory_balances b on b.store_id=p.store_id and b.product_id=p.id
  where p.store_id=sid and p.archived_at is null
 ), history as (
  select i.product_id,(s.completed_at at time zone 'Asia/Dhaka')::date sale_day,sum(i.quantity)::bigint units
  from public.sales s join public.sale_items i on i.store_id=s.store_id and i.sale_id=s.id
  where s.store_id=sid and s.completed_at>=day_start-interval '56 days' and s.completed_at<day_start
  group by i.product_id,(s.completed_at at time zone 'Asia/Dhaka')::date
 ), stats as (
  select product_id,
   coalesce(sum(units) filter(where sale_day>=day_date-7),0) units_7d,
   coalesce(sum(units) filter(where sale_day>=day_date-14 and sale_day<day_date-7),0) units_prev_7d,
   coalesce(sum(units) filter(where sale_day>=day_date-30),0) units_30d,
   count(*) filter(where sale_day>=day_date-30) active_sale_days_30d
  from history group by product_id
 ), selected as (
  select a.*,coalesce(h.units_7d,0) units_7d,coalesce(h.units_prev_7d,0) units_prev_7d,
   coalesce(h.units_30d,0) units_30d,coalesce(h.active_sale_days_30d,0) active_sale_days_30d
  from active a left join stats h on h.product_id=a.id
  order by (a.quantity<a.minimum_stock) desc,coalesce(h.units_30d,0) desc,a.quantity::numeric*a.reference_cost_paisa desc,a.id
  limit 24
 ), observations as (
  select p.id,p.name,p.sku,p.unit,p.quantity,p.minimum_stock,p.selling_price_paisa,p.reference_cost_paisa,
   p.units_7d,p.units_prev_7d,p.units_30d,p.active_sale_days_30d,
   least(56,greatest(0,day_date-(p.created_at at time zone 'Asia/Dhaka')::date)) observed_days,
   recent.last_sale_at,
   case when coalesce(recent.last_sale_at,received.first_received_at) is null then null
    else greatest(0,day_date-(coalesce(recent.last_sale_at,received.first_received_at) at time zone 'Asia/Dhaka')::date) end days_without_sale,
   coalesce((select sum(i.quantity) from public.sales s join public.sale_items i on i.sale_id=s.id and i.store_id=s.store_id
    where s.store_id=sid and i.product_id=p.id and s.completed_at>=day_start and s.completed_at<=stamp),0) units_today,
   (select jsonb_agg(coalesce(h.units,0) order by d.n)
    from generate_series(0,55) d(n) left join history h on h.product_id=p.id and h.sale_day=day_date-56+d.n) daily_units
  from selected p
  left join lateral (select max(s.completed_at) last_sale_at from public.sale_items i join public.sales s on s.store_id=i.store_id and s.id=i.sale_id
   where i.store_id=sid and i.product_id=p.id and s.completed_at<=stamp) recent on true
  left join lateral (select min(m.created_at) first_received_at from public.stock_movements m
   where m.store_id=sid and m.product_id=p.id and m.source_type='purchase' and m.created_at<=stamp) received on true
 )
 select private.safe_json(jsonb_build_object(
  'schema_version','prediction-facts-v3','snapshot_at',stamp,'business_date',day_date,'timezone','Asia/Dhaka','currency','BDT','data_revision',w->'data_revision',
  'history_from',day_date-56,'history_to',day_date-1,'history_days',56,'horizon_days',7,
  'total_products',(select count(*) from active),'products_truncated',(select count(*)>24 from active),
  'products',coalesce((select jsonb_agg(to_jsonb(o) order by (o.quantity<o.minimum_stock) desc,o.units_30d desc,o.id) from observations o),'[]'::jsonb),
  'inventory',w->'inventory','sales_today',w->'sales',
  'external_context',jsonb_build_object('weather','not_available','local_events','not_available','competitor_prices','not_available','supplier_lead_times','not_available')
 )) into facts;
 return jsonb_build_object('facts',facts,'facts_hash',private.payload_hash(facts-'snapshot_at'));
end $$;

create function public.latest_prediction(p_language text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); saved jsonb;
begin
 if p_language is null or p_language not in ('en','bn') then perform private.fail('VALIDATION_ERROR'); end if;
 select private.safe_json(to_jsonb(i)) into saved from public.ai_insights i
 where i.store_id=sid and i.language=p_language and i.content->>'schema_version'='ai-prediction-v3'
 order by i.generated_at desc,i.id desc limit 1;
 return jsonb_build_object('insight',saved,'has_legacy_result',exists(
  select 1 from public.ai_insights i where i.store_id=sid and i.language=p_language
   and i.content->>'schema_version' is distinct from 'ai-prediction-v3'));
end $$;

-- No p_force flag and no cached-result branch: each accepted generation gets a new lease.
create function public.begin_prediction(p_language text,p_provider text,p_model text,p_prompt_version text,p_limit integer default 10) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 s public.stores:=private.store_lock(); ctx jsonb; active_lease private.ai_leases;
 bucket timestamptz:=date_trunc('hour',clock_timestamp()); used integer; new_id uuid:=gen_random_uuid();
begin
 if p_language is null or p_language not in ('en','bn') or p_provider is null or p_provider not in ('openrouter','gemini')
  or p_model is null or p_model !~ '^[a-zA-Z0-9._:/-]{1,160}$'
  or p_prompt_version is null or p_prompt_version !~ '^inventory-predictions-v3(-[a-zA-Z0-9._-]+)?$' or char_length(p_prompt_version)>100
  or p_limit is null or p_limit not between 1 and 10 then perform private.fail('VALIDATION_ERROR'); end if;
 select * into active_lease from private.ai_leases where store_id=s.id and language=p_language;
 if found and active_lease.expires_at>clock_timestamp() then perform private.fail('AI_IN_PROGRESS'); end if;
 select request_count into used from private.ai_request_windows where store_id=s.id and window_start=bucket;
 if coalesce(used,0)>=p_limit then perform private.fail('AI_RATE_LIMITED'); end if;
 ctx:=public.get_prediction_context();
 insert into private.ai_request_windows(store_id,window_start,request_count) values(s.id,bucket,1)
 on conflict(store_id,window_start) do update set request_count=private.ai_request_windows.request_count+1;
 insert into private.ai_leases(store_id,language,lease_id,expires_at,metadata)
 values(s.id,p_language,new_id,clock_timestamp()+interval '90 seconds',jsonb_build_object('kind','prediction-v3','context',ctx,'provider',p_provider,'model',p_model,'prompt_version',p_prompt_version))
 on conflict(store_id,language) do update set lease_id=excluded.lease_id,expires_at=excluded.expires_at,metadata=excluded.metadata;
 delete from private.ai_request_windows where store_id=s.id and window_start<clock_timestamp()-interval '2 days';
 return jsonb_build_object('lease_id',new_id,'context',ctx);
end $$;

create function private.prediction_text(v jsonb,max_length integer) returns void
language plpgsql immutable set search_path='' as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or char_length(btrim(v#>>'{}')) not between 1 and max_length
  or v#>>'{}' ~ '[<>]|https?://|\{\{' then perform private.fail('AI_INVALID_OUTPUT'); end if;
end $$;
create function private.prediction_evidence(v jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare e jsonb;
begin
 if jsonb_typeof(v) is distinct from 'array' then perform private.fail('AI_INVALID_OUTPUT'); end if;
 if jsonb_array_length(v) not between 1 and 5 or (select count(distinct value) from jsonb_array_elements(v))<>jsonb_array_length(v) then perform private.fail('AI_INVALID_OUTPUT'); end if;
 for e in select value from jsonb_array_elements(v) loop
  if jsonb_typeof(e) is distinct from 'string' or e#>>'{}' not in
   ('sales_last_7_days','sales_previous_7_days','sales_last_30_days','daily_sales_history','current_stock','minimum_stock','price_and_reference_cost','days_since_last_sale','limited_history')
   then perform private.fail('AI_INVALID_OUTPUT'); end if;
 end loop;
end $$;
create function private.validate_prediction(output jsonb,facts jsonb) returns void
language plpgsql immutable set search_path='' as $$
declare item jsonb; product jsonb; e jsonb; field text; n numeric; price_after numeric;
begin
 if facts->>'schema_version' is distinct from 'prediction-facts-v3' or octet_length(output::text)>80000 then perform private.fail('AI_INVALID_OUTPUT'); end if;
 perform private.keys(output,array['summary','predictions','suggestions','assumptions','limitations'],array['summary','predictions','suggestions','assumptions','limitations']);
 perform private.prediction_text(output->'summary',900);
 foreach field in array array['predictions','suggestions','assumptions','limitations'] loop
  if jsonb_typeof(output->field) is distinct from 'array' then perform private.fail('AI_INVALID_OUTPUT'); end if;
 end loop;
 if jsonb_array_length(output->'predictions')>12 or jsonb_array_length(output->'suggestions') not between 1 and 8
  or jsonb_array_length(output->'assumptions') not between 1 and 5 or jsonb_array_length(output->'limitations') not between 1 and 5 then perform private.fail('AI_INVALID_OUTPUT'); end if;
 for e in select value from jsonb_array_elements((output->'assumptions')||(output->'limitations')) loop perform private.prediction_text(e,300); end loop;
 if (select count(distinct value->>'product_id') from jsonb_array_elements(output->'predictions'))<>jsonb_array_length(output->'predictions') then perform private.fail('AI_INVALID_OUTPUT'); end if;
 for item in select value from jsonb_array_elements(output->'predictions') loop
  perform private.keys(item,array['product_id','expected_units_7d','low_units_7d','high_units_7d','confidence','explanation','evidence'],array['product_id','expected_units_7d','low_units_7d','high_units_7d','confidence','explanation','evidence']);
  select value into product from jsonb_array_elements(facts->'products') where value->>'id'=item->>'product_id';
  if product is null or jsonb_typeof(item->'product_id') is distinct from 'string' then perform private.fail('AI_INVALID_OUTPUT'); end if;
  foreach field in array array['expected_units_7d','low_units_7d','high_units_7d'] loop
   if jsonb_typeof(item->field) is distinct from 'number' then perform private.fail('AI_INVALID_OUTPUT'); end if;
   n:=(item->>field)::numeric;
   if n<>trunc(n) or n not between 0 and 1000000 then perform private.fail('AI_INVALID_OUTPUT'); end if;
  end loop;
  if (item->>'low_units_7d')::numeric>(item->>'expected_units_7d')::numeric or (item->>'expected_units_7d')::numeric>(item->>'high_units_7d')::numeric then perform private.fail('AI_INVALID_OUTPUT'); end if;
  if jsonb_typeof(item->'confidence') is distinct from 'string' or item->>'confidence' not in ('low','medium','high') then perform private.fail('AI_INVALID_OUTPUT'); end if;
  if item->>'confidence'='high' and ((product->>'observed_days')::integer<28 or (product->>'active_sale_days_30d')::integer<8) then perform private.fail('AI_INVALID_OUTPUT'); end if;
  perform private.prediction_text(item->'explanation',500); perform private.prediction_evidence(item->'evidence');
 end loop;
 if (select count(distinct (value->>'product_id',value->>'action')) from jsonb_array_elements(output->'suggestions'))<>jsonb_array_length(output->'suggestions') then perform private.fail('AI_INVALID_OUTPUT'); end if;
 for item in select value from jsonb_array_elements(output->'suggestions') loop
  perform private.keys(item,array['product_id','action','priority','title','explanation','expected_impact','reorder_quantity','discount_percent','evidence'],array['product_id','action','priority','title','explanation','expected_impact','reorder_quantity','discount_percent','evidence']);
  if jsonb_typeof(item->'action') is distinct from 'string' or item->>'action' not in ('restock','discount_test','promote','hold_reorder','protect_margin','collect_data')
   or jsonb_typeof(item->'priority') is distinct from 'string' or item->>'priority' not in ('high','medium','low') then perform private.fail('AI_INVALID_OUTPUT'); end if;
  product:=null;
  if item->'product_id'<>'null'::jsonb then
   select value into product from jsonb_array_elements(facts->'products') where value->>'id'=item->>'product_id';
   if product is null or jsonb_typeof(item->'product_id') is distinct from 'string' then perform private.fail('AI_INVALID_OUTPUT'); end if;
  elsif item->>'action'<>'collect_data' then perform private.fail('AI_INVALID_OUTPUT'); end if;
  perform private.prediction_text(item->'title',140); perform private.prediction_text(item->'explanation',600); perform private.prediction_text(item->'expected_impact',400); perform private.prediction_evidence(item->'evidence');
  if item->>'action'='restock' then
   if jsonb_typeof(item->'reorder_quantity') is distinct from 'number' then perform private.fail('AI_INVALID_OUTPUT'); end if;
   n:=(item->>'reorder_quantity')::numeric;
   if n<>trunc(n) or n not between 1 and 1000000 or not exists(select 1 from jsonb_array_elements(output->'predictions') where value->>'product_id'=item->>'product_id') then perform private.fail('AI_INVALID_OUTPUT'); end if;
  elsif item->'reorder_quantity'<>'null'::jsonb then perform private.fail('AI_INVALID_OUTPUT'); end if;
  if item->>'action'='discount_test' then
   if jsonb_typeof(item->'discount_percent') is distinct from 'number' then perform private.fail('AI_INVALID_OUTPUT'); end if;
   n:=(item->>'discount_percent')::numeric;
   if n<>trunc(n) or n not between 1 and 30 or (product->>'quantity')::integer<=0 or (product->>'reference_cost_paisa')::numeric<=0 then perform private.fail('AI_INVALID_OUTPUT'); end if;
   price_after:=round((product->>'selling_price_paisa')::numeric*(100-n)/100);
   if (price_after-(product->>'reference_cost_paisa')::numeric)*100<price_after*10 then perform private.fail('AI_INVALID_OUTPUT'); end if;
  elsif item->'discount_percent'<>'null'::jsonb then perform private.fail('AI_INVALID_OUTPUT'); end if;
 end loop;
end $$;

create function public.finish_prediction(p_lease_id uuid,p_output jsonb,p_response_id text default null,p_response_model text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.stores:=private.store_lock(); active_lease private.ai_leases; facts jsonb; saved public.ai_insights;
begin
 select * into active_lease from private.ai_leases where store_id=s.id and lease_id=p_lease_id and expires_at>clock_timestamp() and metadata->>'kind'='prediction-v3';
 if not found then perform private.fail('AI_TIMEOUT'); end if;
 if (p_response_id is not null and char_length(p_response_id) not between 1 and 200) or (p_response_model is not null and char_length(p_response_model) not between 1 and 160) then perform private.fail('AI_INVALID_OUTPUT'); end if;
 facts:=active_lease.metadata->'context'->'facts';
 perform private.validate_prediction(p_output,facts);
 insert into public.ai_insights(store_id,language,provider,model,prompt_version,facts_hash,store_data_revision,business_date,facts_snapshot,content,generated_at)
 values(s.id,active_lease.language,active_lease.metadata->>'provider',active_lease.metadata->>'model',active_lease.metadata->>'prompt_version',active_lease.metadata->'context'->>'facts_hash',(facts->>'data_revision')::bigint,(facts->>'business_date')::date,facts,
  jsonb_build_object('schema_version','ai-prediction-v3','output',p_output,'provider_response_id',p_response_id,'response_model',p_response_model),clock_timestamp()) returning * into saved;
 delete from private.ai_leases where store_id=s.id and lease_id=p_lease_id;
 -- Retain previous v3 results for read/failure recovery; legacy rows are not deleted by this upgrade.
 delete from public.ai_insights where store_id=s.id and language=active_lease.language and content->>'schema_version'='ai-prediction-v3' and id in
  (select id from public.ai_insights where store_id=s.id and language=active_lease.language and content->>'schema_version'='ai-prediction-v3' order by generated_at desc,id desc offset 20);
 return private.safe_json(to_jsonb(saved));
end $$;

revoke all on function private.prediction_text(jsonb,integer),private.prediction_evidence(jsonb),private.validate_prediction(jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.get_prediction_context(),public.latest_prediction(text),public.begin_prediction(text,text,text,text,integer),public.finish_prediction(uuid,jsonb,text,text) from public,anon;
grant execute on function public.get_prediction_context(),public.latest_prediction(text),public.begin_prediction(text,text,text,text,integer),public.finish_prediction(uuid,jsonb,text,text) to authenticated;
