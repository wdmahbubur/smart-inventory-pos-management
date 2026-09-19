import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/dates';
export async function GET(request:Request) {
 const url=new URL(request.url);const origin=process.env.APP_URL;
 if(!origin)return NextResponse.redirect(new URL('/login?error=configuration',url.origin));
 const code=url.searchParams.get('code');
 if(code){const client=await createClient();const {error}=await client.auth.exchangeCodeForSession(code);if(!error){const setup=await client.rpc('create_owner_store',{});if(!setup.error)return NextResponse.redirect(new URL(safeNext(url.searchParams.get('next')),origin));}}
 return NextResponse.redirect(new URL('/forgot-password?error=invalid-link',origin));
}
