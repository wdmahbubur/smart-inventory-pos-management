import { AuthScreen } from '@/features/auth';
import { isConfigured } from '@/lib/supabase/server';
export default function Register(){return <AuthScreen mode="register" configured={isConfigured()}/>}
