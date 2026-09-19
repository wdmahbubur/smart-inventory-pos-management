import { AuthScreen } from '@/features/auth';
import { isConfigured } from '@/lib/supabase/server';
import { safeNext } from '@/lib/dates';
export default async function Login({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){const p=await searchParams;return <AuthScreen mode="login" next={safeNext(p.next)} configured={isConfigured()}/>}
