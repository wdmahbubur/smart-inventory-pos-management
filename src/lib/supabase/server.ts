import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { AppError } from '@/lib/errors';
export function isConfigured(): boolean { return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; }
export async function createClient() {
 if (!isConfigured()) throw new AppError('SETUP_REQUIRED');
 const jar = await cookies();
 const remember = jar.get('si_remember')?.value === '1';
 return createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
  cookies: {
   getAll: () => jar.getAll(),
   setAll: values => { try { for (const {name,value,options} of values) { const config={...options}; if (!remember && value) { delete config.maxAge; delete config.expires; } jar.set(name,value,config); } } catch { /* Server Components cannot write cookies; proxy handles refresh. */ } }
  }
 });
}
