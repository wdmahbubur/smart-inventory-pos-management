import Link from 'next/link';
import {Shell} from '@/components/shell';
import {Logo} from '@/components/brand';
import {Notice} from '@/components/ui';
import {pageWorkspace} from '@/lib/server/data';
import {isConfigured} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export default async function AppLayout({children}:{children:React.ReactNode}){
 if(!isConfigured())return <main id="main-content" className="setup-page"><Logo/><h1>Connect your inventory database</h1><p>This deployment is ready for a dedicated Supabase project. No store data is available until its environment variables and migrations are configured.</p><Notice tone="warning">Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and APP_URL, apply the migrations, then redeploy. Do not point this app at an unrelated production database.</Notice><Link href="/" className="button" style={{marginTop:22}}>Back to home</Link></main>;
 return <Shell workspace={await pageWorkspace()}>{children}</Shell>;
}
