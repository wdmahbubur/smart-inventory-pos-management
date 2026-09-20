-- Make onboarding truly idempotent for users whose profile/store already exist.
-- Admin-created users are provisioned by the auth trigger with safe fallback names;
-- subsequent logins must not re-require signup metadata.
create or replace function public.create_owner_store()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  meta jsonb;
  sid uuid;
  display text;
  store_name text;
begin
  if auth.uid() is null then
    perform private.fail('UNAUTHENTICATED');
  end if;

  select id into sid
  from public.stores
  where owner_user_id = auth.uid();

  if sid is not null then
    return jsonb_build_object('id', sid);
  end if;

  select raw_user_meta_data into meta
  from auth.users
  where id = auth.uid()
  for update;

  if not found then
    perform private.fail('UNAUTHENTICATED');
  end if;

  display := private.text_value(meta, 'full_name', 2, 100);
  store_name := private.text_value(meta, 'store_name', 2, 100);

  insert into public.profiles(id, display_name)
  values(auth.uid(), display)
  on conflict(id) do nothing;

  insert into public.stores(owner_user_id, name)
  values(auth.uid(), store_name)
  on conflict(owner_user_id) do nothing;

  select id into sid
  from public.stores
  where owner_user_id = auth.uid();

  return jsonb_build_object('id', sid);
end
$function$;
