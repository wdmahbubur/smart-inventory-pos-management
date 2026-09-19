'use client';
import Link from 'next/link';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <main className="setup-page" id="main-content"><h1>We could not load this page</h1><p>No replacement or sample data has been shown. Check your connection or sign in again. A new deployment must have its dedicated Supabase environment and migrations configured.</p><div className="button-row"><button type="button" className="button primary" onClick={reset}>Try again</button><Link href="/login" className="button">Log in</Link></div></main>}
