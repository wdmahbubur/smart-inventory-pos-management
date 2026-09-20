/** Read-only hosted checks. Uses only the intentionally public Supabase client key. */
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {URL, pathToFileURL} from 'node:url';
import process from 'node:process';

export async function checkHostedPublic(target, transport = globalThis.fetch) {
  if (target.supabaseProjectRef !== 'galgetikfkyceqkaqdha' || target.supabaseUrl !== 'https://galgetikfkyceqkaqdha.supabase.co' ||
      !target.supabasePublishableKey?.startsWith('sb_publishable_')) throw new Error('UNAPPROVED_PUBLIC_TARGET');
  const checks = [];
  const settings = await transport(`${target.supabaseUrl}/auth/v1/settings`, {
    headers: {apikey: target.supabasePublishableKey}, redirect: 'error', signal: globalThis.AbortSignal.timeout(15000),
  });
  if (settings.status !== 200) throw new Error(`AUTH_SETTINGS_UNAVAILABLE:${settings.status}`);
  const auth = await settings.json();
  checks.push({check: 'Auth service reachable with publishable key', passed: true});
  const tables = ['profiles','stores','categories','suppliers','products','inventory_balances','purchases','purchase_items','sales','sale_items','stock_movements','ai_insights'];
  for (const table of tables) {
    const response = await transport(`${target.supabaseUrl}/rest/v1/${table}?select=*&limit=0`, {
      headers: {apikey: target.supabasePublishableKey}, redirect: 'error', signal: globalThis.AbortSignal.timeout(15000),
    });
    if (![401,403].includes(response.status)) throw new Error(`ANON_READ_NOT_DENIED:${table}:${response.status}`);
    checks.push({check: `Anonymous SELECT denied: ${table}`, passed: true, http_status: response.status});
  }
  // These RPCs only read. No checkout, catalog, signup, seed or other write is attempted.
  for (const rpc of ['get_workspace','get_insight_context']) {
    const response = await transport(`${target.supabaseUrl}/rest/v1/rpc/${rpc}`, {
      method: 'POST', headers: {apikey: target.supabasePublishableKey, 'Content-Type': 'application/json'},
      body: '{}', redirect: 'error', signal: globalThis.AbortSignal.timeout(15000),
    });
    if (![401,403].includes(response.status)) throw new Error(`ANON_RPC_NOT_DENIED:${rpc}:${response.status}`);
    checks.push({check: `Anonymous read RPC denied: ${rpc}`, passed: true, http_status: response.status});
  }
  return {checked_at: new Date().toISOString(), target: target.supabaseProjectRef, checks,
    email_provider_enabled: auth.external?.email === true,
    scope: 'Hosted HTTP reachability and anonymous denial only; no authenticated users, emails, provider calls or business writes'};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = JSON.parse(await readFile(new URL('../config/deployment-target.json', import.meta.url), 'utf8'));
  try {
    const result = await checkHostedPublic(target);
    await mkdir('test-results', {recursive: true});
    await writeFile('test-results/hosted-public.json', JSON.stringify(result,null,2)+'\n');
    process.stdout.write(`${result.checks.length} hosted read-only checks passed. No business data was changed.\n`);
  } catch { process.stderr.write('Hosted public preflight failed. Check project availability, publishable key and anonymous access grants.\n'); process.exitCode=1; }
}
