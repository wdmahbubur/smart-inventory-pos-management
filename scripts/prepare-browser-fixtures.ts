import {createClient} from '@supabase/supabase-js';
import pg from 'pg';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {seedDemo} from './seed';
const url=process.env.NEXT_PUBLIC_SUPABASE_URL??'',key=process.env.SUPABASE_TEST_SERVICE_KEY??'',database=process.env.DATABASE_URL??'';
if(!['127.0.0.1','localhost'].includes(new URL(url).hostname))throw new Error('Browser fixtures require a disposable localhost Supabase stack.');
const admin=createClient(url,key,{auth:{persistSession:false}}),db=new pg.Client({connectionString:database});await db.connect();
const password=`Local-${randomUUID()}-Aa1!`;const fixtures:Record<string,unknown>={password};
try{for(const state of ['pre-sale','post-sale'] as const){const email=`${state}-${randomUUID()}@example.test`;const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:'Mahbub',store_name:'Mahbub General Store'}});if(error||!data.user)throw new Error('Local fixture Auth user creation failed.');await db.query('update public.stores set is_demo=true where owner_user_id=$1 and not exists(select 1 from public.products p join public.stores s on s.id=p.store_id where s.owner_user_id=$1)',[data.user.id]);fixtures[state]={email,...await seedDemo(database,data.user.id,state)};}await writeFile('.local-browser-fixtures.json',JSON.stringify(fixtures),{mode:0o600});}finally{await db.end();}
