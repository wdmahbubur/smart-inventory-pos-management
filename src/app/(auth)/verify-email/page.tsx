import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Notice } from '@/components/ui';
export default function VerifyEmail(){return <main id="main-content" className="setup-page"><Logo/><h1>Check your email</h1><p>Follow the verification link to finish creating your store. A new account starts with an empty catalog and no stock.</p><Notice>Already verified? Log in to continue. If no message arrives, check spam and your Supabase email-delivery configuration.</Notice><Link className="button primary" style={{marginTop:22}} href="/login">Back to log in</Link></main>}
