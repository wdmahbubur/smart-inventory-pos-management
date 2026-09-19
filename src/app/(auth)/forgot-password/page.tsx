import { AuthScreen } from '@/features/auth';
import { isConfigured } from '@/lib/supabase/server';
export default function ForgotPassword(){return <AuthScreen mode="forgot-password" configured={isConfigured()}/>}
