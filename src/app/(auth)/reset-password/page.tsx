import { AuthScreen } from '@/features/auth';
import { isConfigured } from '@/lib/supabase/server';
export default function ResetPassword(){return <AuthScreen mode="reset-password" configured={isConfigured()}/>}
