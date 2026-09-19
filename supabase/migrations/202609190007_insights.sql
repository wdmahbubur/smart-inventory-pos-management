-- AI can explain a consistent fact snapshot, but never receives a write capability.
create function public.get_insight_context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare w jsonb:=public.get_workspace(); facts jsonb;
begin
 facts:=jsonb_build_object('schema_version','inventory-facts-v1','snapshot_at',w->'snapshot_at','business_date',w->'business_date','timezone','Asia/Dhaka','currency','BDT','data_revision',w->'data_revision',
 'inventory',w->'inventory','sales',w->'sales','purchases',w->'purchases',
 'attention',coalesce((select jsonb_agg(jsonb_build_object('id',x->'id','name',x->'name','quantity',x->'quantity','minimum_stock',x->'minimum_stock','unit',x->'unit','shortage',x->'shortage')) from jsonb_array_elements(w->'attention') x),'[]'::jsonb),
 'attention_truncated',w->'attention_truncated','categories',w->'categories','highest_category',w->'highest_category',
 'definitions',jsonb_build_object('inventory_value','Current active quantity multiplied by current reference purchase cost; not accounting valuation or profit.','net_sales','Today completed gross line sales less order discounts; excludes tender and change.','received_value','Today received goods at their actual captured unit costs; excludes drafts.','shortage','Greatest of minimum minus available and zero; not a forecast.'));
 return jsonb_build_object('facts',facts,'facts_hash',private.payload_hash(facts-'snapshot_at'));
end $$;

create function public.latest_insight(p_language text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare sid uuid:=private.store_id(); result jsonb;
begin
 if p_language not in ('bn','en') or p_language is null then perform private.fail('VALIDATION_ERROR'); end if;
 select private.safe_json(to_jsonb(i)) into result from public.ai_insights i where store_id=sid and language=p_language order by generated_at desc,id desc limit 1;
 return result;
end $$;

create function public.begin_insight(p_language text,p_provider text,p_model text,p_prompt_version text,p_force boolean default false,p_limit integer default 10) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.stores:=private.store_lock(); context jsonb; cached public.ai_insights; lease private.ai_leases; window_start timestamptz:=date_trunc('hour',clock_timestamp()); count_used integer; lease_id uuid:=gen_random_uuid();
begin
 if p_language is null or p_language not in ('bn','en') or p_provider is distinct from 'gemini' or p_model is null or p_model !~ '^[a-zA-Z0-9._-]{1,100}$' or p_prompt_version is null or char_length(p_prompt_version) not between 1 and 100 or p_limit is null or p_limit not between 1 and 10 or p_force is null then perform private.fail('VALIDATION_ERROR'); end if;
 context:=public.get_insight_context();
 if not p_force then
  select * into cached from public.ai_insights i where i.store_id=s.id and i.language=p_language and i.provider=p_provider and i.model=p_model and i.prompt_version=p_prompt_version and i.facts_hash=context->>'facts_hash' and i.store_data_revision=(context->'facts'->>'data_revision')::bigint and i.business_date=(context->'facts'->>'business_date')::date order by i.generated_at desc,i.id desc limit 1;
  if found then return jsonb_build_object('cached',true,'insight',private.safe_json(to_jsonb(cached)),'context',context); end if;
 end if;
 select * into lease from private.ai_leases where store_id=s.id and language=p_language;
 if found and lease.expires_at>clock_timestamp() then perform private.fail('AI_IN_PROGRESS'); end if;
 select request_count into count_used from private.ai_request_windows w where w.store_id=s.id and w.window_start=begin_insight.window_start;
 if coalesce(count_used,0)>=p_limit then perform private.fail('AI_RATE_LIMITED'); end if;
 insert into private.ai_request_windows(store_id,window_start,request_count) values(s.id,window_start,1)
 on conflict(store_id,window_start) do update set request_count=private.ai_request_windows.request_count+1;
 insert into private.ai_leases(store_id,language,lease_id,expires_at,metadata) values(s.id,p_language,lease_id,clock_timestamp()+interval '90 seconds',jsonb_build_object('context',context,'provider',p_provider,'model',p_model,'prompt_version',p_prompt_version))
 on conflict(store_id,language) do update set lease_id=excluded.lease_id,expires_at=excluded.expires_at,metadata=excluded.metadata;
 delete from private.ai_request_windows where store_id=s.id and window_start<clock_timestamp()-interval '2 days';
 return jsonb_build_object('cached',false,'lease_id',lease_id,'context',context);
end $$;

create function public.finish_insight(p_lease_id uuid,p_content jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.stores:=private.store_lock(); lease private.ai_leases; snapshot jsonb; saved public.ai_insights; entry jsonb;
begin
 select * into lease from private.ai_leases where store_id=s.id and lease_id=p_lease_id and expires_at>clock_timestamp();
 if not found then perform private.fail('AI_TIMEOUT'); end if;
 -- Persist only a small validated selection, never arbitrary provider prose or SQL.
 -- These keys resolve to approved fact-bound statements in the application.
 perform private.keys(p_content,array['summary_key','section_keys'],array['summary_key','section_keys']);
 if p_content->>'summary_key' not in ('overview','attention','activity') or jsonb_typeof(p_content->'summary_key')<>'string' or jsonb_typeof(p_content->'section_keys')<>'array' then perform private.fail('AI_INVALID_OUTPUT'); end if;
 if jsonb_array_length(p_content->'section_keys') not between 1 and 3 or (select count(distinct value) from jsonb_array_elements(p_content->'section_keys'))<>jsonb_array_length(p_content->'section_keys') then perform private.fail('AI_INVALID_OUTPUT'); end if;
 snapshot:=lease.metadata->'context'->'facts';
 for entry in select value from jsonb_array_elements(p_content->'section_keys') loop
  if jsonb_typeof(entry)<>'string' or entry#>>'{}' not in ('stock','category','activity') then perform private.fail('AI_INVALID_OUTPUT'); end if;
  if entry#>>'{}'='category' and (snapshot->'highest_category'='null'::jsonb or snapshot->'highest_category' is null) then perform private.fail('AI_INVALID_OUTPUT'); end if;
 end loop;
 insert into public.ai_insights(store_id,language,provider,model,prompt_version,facts_hash,store_data_revision,business_date,facts_snapshot,content,generated_at)
 values(s.id,lease.language,lease.metadata->>'provider',lease.metadata->>'model',lease.metadata->>'prompt_version',lease.metadata->'context'->>'facts_hash',(snapshot->>'data_revision')::bigint,(snapshot->>'business_date')::date,snapshot,p_content,clock_timestamp()) returning * into saved;
 delete from private.ai_leases where store_id=s.id and lease_id=p_lease_id;
 delete from public.ai_insights where store_id=s.id and language=lease.language and id in (select id from public.ai_insights where store_id=s.id and language=lease.language order by generated_at desc,id desc offset 20);
 return private.safe_json(to_jsonb(saved));
end $$;

create function public.release_insight_lease(p_lease_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.stores:=private.store_lock();
begin
 delete from private.ai_leases where store_id=s.id and lease_id=p_lease_id;
 return jsonb_build_object('released',true);
end $$;
revoke all on function public.get_insight_context(),public.latest_insight(text),public.begin_insight(text,text,text,text,boolean,integer),public.finish_insight(uuid,jsonb),public.release_insight_lease(uuid) from public,anon;
grant execute on function public.get_insight_context(),public.latest_insight(text),public.begin_insight(text,text,text,text,boolean,integer),public.finish_insight(uuid,jsonb),public.release_insight_lease(uuid) to authenticated;
