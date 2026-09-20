-- Allow the registered OpenRouter adapter at the durable AI quota/cache boundary.
-- OpenRouter model slugs contain "/" and optional routing suffixes such as ":free".
create or replace function public.begin_insight(
 p_language text,
 p_provider text,
 p_model text,
 p_prompt_version text,
 p_force boolean default false,
 p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 s public.stores:=private.store_lock();
 context jsonb;
 cached public.ai_insights;
 active_lease private.ai_leases;
 hour_bucket timestamptz:=date_trunc('hour',clock_timestamp());
 count_used integer;
 new_lease_id uuid:=gen_random_uuid();
begin
 if p_language is null
    or p_language not in ('bn','en')
    or p_provider is null
    or p_provider not in ('gemini','openrouter')
    or p_model is null
    or p_model !~ '^[a-zA-Z0-9._:/-]{1,160}$'
    or p_prompt_version is null
    or char_length(p_prompt_version) not between 1 and 100
    or p_limit is null
    or p_limit not between 1 and 10
    or p_force is null
 then perform private.fail('VALIDATION_ERROR'); end if;

 context:=public.get_insight_context();
 if not p_force then
  select * into cached
  from public.ai_insights i
  where i.store_id=s.id
    and i.language=p_language
    and i.provider=p_provider
    and i.model=p_model
    and i.prompt_version=p_prompt_version
    and i.facts_hash=context->>'facts_hash'
    and i.store_data_revision=(context->'facts'->>'data_revision')::bigint
    and i.business_date=(context->'facts'->>'business_date')::date
  order by i.generated_at desc,i.id desc
  limit 1;
  if found then
   return jsonb_build_object('cached',true,'insight',private.safe_json(to_jsonb(cached)),'context',context);
  end if;
 end if;

 select * into active_lease from private.ai_leases l where l.store_id=s.id and l.language=p_language;
 if found and active_lease.expires_at>clock_timestamp() then perform private.fail('AI_IN_PROGRESS'); end if;

 select w.request_count into count_used
 from private.ai_request_windows w
 where w.store_id=s.id and w.window_start=hour_bucket;
 if coalesce(count_used,0)>=p_limit then perform private.fail('AI_RATE_LIMITED'); end if;

 insert into private.ai_request_windows(store_id,window_start,request_count)
 values(s.id,hour_bucket,1)
 on conflict(store_id,window_start)
 do update set request_count=private.ai_request_windows.request_count+1;

 insert into private.ai_leases(store_id,language,lease_id,expires_at,metadata)
 values(s.id,p_language,new_lease_id,clock_timestamp()+interval '90 seconds',
        jsonb_build_object('context',context,'provider',p_provider,'model',p_model,'prompt_version',p_prompt_version))
 on conflict(store_id,language)
 do update set lease_id=excluded.lease_id,expires_at=excluded.expires_at,metadata=excluded.metadata;

 delete from private.ai_request_windows w
 where w.store_id=s.id and w.window_start<clock_timestamp()-interval '2 days';

 return jsonb_build_object('cached',false,'lease_id',new_lease_id,'context',context);
end $$;
