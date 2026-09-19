'use server';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {z} from 'zod';
import {createClient,isConfigured} from '@/lib/supabase/server';
import {registerSchema,loginSchema,resetSchema} from '@/lib/schemas';
import {safeNext} from '@/lib/dates';
export interface AuthState {message:string;fields?:Record<string,string[]>;success?:boolean;}
export async function authenticate(mode:string,_previous:AuthState,form:FormData):Promise<AuthState>{
 if(!isConfigured())return {message:'Supabase is not configured for this deployment yet. No account or reset email has been created.'};
 const raw=Object.fromEntries(form),origin=process.env.APP_URL;
 if(!origin)return {message:'Set APP_URL before enabling authentication callbacks.'};
 const schema=mode==='register'?registerSchema:mode==='reset-password'?resetSchema:mode==='forgot-password'?z.object({email:z.string().trim().email()}):loginSchema;
 const parsed=schema.safeParse(raw);
 if(!parsed.success)return {message:'Please check the form.',fields:parsed.error.flatten().fieldErrors as Record<string,string[]>};
 const jar=await cookies();
 if(mode==='login')jar.set('si_remember',form.get('remember')==='on'?'1':'0',{httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:'),path:'/',maxAge:365*86400});
 const client=await createClient();
 if(mode==='register'){
  const value=registerSchema.parse(raw);
  const {data,error}=await client.auth.signUp({email:value.email,password:value.password,options:{data:{full_name:value.full_name,store_name:value.store_name},emailRedirectTo:new URL('/auth/callback',origin).toString()}});
  if(error)return {message:'Registration could not be completed. Check your details or try logging in. If you tried repeatedly, wait before trying again.'};
  if(!data.session)redirect('/verify-email');
  const onboarding=await client.rpc('create_owner_store');
  if(onboarding.error)return {message:'Your account exists, but store setup did not finish. Log in to retry onboarding.'};
  redirect('/dashboard');
 }
 if(mode==='forgot-password'){
  const last=Number(jar.get('si_recovery_at')?.value??0);
  if(Date.now()-last<60000)return {message:'Please wait a minute before requesting another link.'};
  jar.set('si_recovery_at',String(Date.now()),{httpOnly:true,sameSite:'lax',secure:origin.startsWith('https:'),path:'/',maxAge:60});
  const {error}=await client.auth.resetPasswordForEmail(String(raw.email),{redirectTo:new URL('/auth/callback?next=/reset-password',origin).toString()});
  if(error&&error.status===429)return {message:'Please wait before requesting another reset link.'};
  if(error)return {message:'The reset request could not be completed. Please try again later. This message does not indicate whether an account exists.'};
  return {message:'If an account exists for this email, password-reset instructions will be sent. Check your inbox and spam folder.',success:true};
 }
 if(mode==='reset-password'){
  const {data}=await client.auth.getUser();if(!data.user)return {message:'This reset link is invalid or expired. Request a new link.'};
  const {error}=await client.auth.updateUser({password:String(raw.password)});if(error)return {message:'The password could not be updated. Use a new password or request a new reset link.'};
  await client.auth.signOut({scope:'local'});redirect('/login?reset=success');
 }
 const {error}=await client.auth.signInWithPassword({email:String(raw.email),password:String(raw.password)});
 if(error)return {message:'Unable to log in with those details. Check your email verification or try again later.'};
 const setup=await client.rpc('create_owner_store');if(setup.error)return {message:'Your session is valid, but store setup did not complete. Please retry.'};
 redirect(safeNext(String(form.get('next')??'')));
}
export async function logout(){const client=await createClient();await client.auth.signOut({scope:'local'});redirect('/login');}
