-- Allow trusted Supabase Admin/Dashboard-created users that do not carry
-- application signup metadata, while preserving strict validation whenever
-- full_name/store_name metadata is actually supplied by the application.
create or replace function private.on_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_display_name text;
  v_store_name text;
begin
  if v_meta ? 'full_name' then
    v_display_name := private.text_value(v_meta, 'full_name', 2, 100);
  else
    v_display_name := 'Store Owner';
  end if;

  if v_meta ? 'store_name' then
    v_store_name := private.text_value(v_meta, 'store_name', 2, 100);
  else
    v_store_name := 'My Store';
  end if;

  insert into public.profiles(id, display_name)
  values (new.id, v_display_name);

  insert into public.stores(owner_user_id, name)
  values (new.id, v_store_name);

  return new;
end
$function$;
