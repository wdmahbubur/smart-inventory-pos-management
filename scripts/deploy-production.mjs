/** Target-scoped release tooling. Never migrates, seeds, copies or edits business data. */
import process from 'node:process';
import {readFile, mkdir, writeFile, appendFile} from 'node:fs/promises';
import {pathToFileURL, URL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {Buffer} from 'node:buffer';

export class ReleaseError extends Error {
  constructor(code) { super(code); this.name = 'ReleaseError'; }
}
const reject = code => { throw new ReleaseError(code); };

export function validateTarget(target, env) {
  if (target.repository !== 'wdmahbubur/smart-inventory-pos-management' ||
      target.repositoryId !== '1377140022' || target.branch !== 'master' ||
      target.vercelTeamId !== 'team_0J8aljbnpj2Et8y24OQXjTjV' ||
      target.vercelProjectName !== 'smart-inventory-pos-management' ||
      target.supabaseProjectRef !== 'galgetikfkyceqkaqdha' ||
      target.supabaseOrganizationId !== 'axtcdykuwdvngkwqxspi' ||
      target.supabaseUrl !== `https://${target.supabaseProjectRef}.supabase.co`) reject('UNAPPROVED_TARGET');
  if (env.GITHUB_REPOSITORY !== target.repository || env.GITHUB_REF !== 'refs/heads/master' ||
      !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) reject('UNAPPROVED_SOURCE');
  const missing = ['VERCEL_TOKEN', 'SUPABASE_ACCESS_TOKEN'].filter(key => !env[key]);
  if (missing.length) reject(`SET_GITHUB_ACTIONS_SECRETS:${missing.join(',')}`);
  const key = target.supabasePublishableKey;
  if (!key?.startsWith('sb_publishable_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { reject('PUBLIC_KEY_REQUIRED'); }
    if (claims.role !== 'anon' || claims.ref !== target.supabaseProjectRef) reject('PUBLIC_KEY_REQUIRED');
  }
  // A model must be deliberately selected when enabling AI; no guessed vendor fallback.
  if (env.GEMINI_API_KEY && !/^[a-zA-Z0-9._-]{1,100}$/.test(env.GEMINI_TEXT_MODEL ?? '')) reject('SET_GEMINI_TEXT_MODEL');
}

export function selectOrigin(domains, preferred) {
  const allowed = domains.filter(d => d.verified === true && !d.redirect && !d.gitBranch && !d.customEnvironmentId);
  if (preferred) {
    let url; try { url = new URL(preferred); } catch { reject('INVALID_APP_URL'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash ||
        !['', '/'].includes(url.pathname) || !allowed.some(d => d.name === url.hostname)) reject('APP_URL_NOT_VERIFIED_FOR_PROJECT');
    return url.origin;
  }
  const domain = allowed.find(d => /^[a-z0-9-]+\.vercel\.app$/.test(d.name));
  if (!domain) reject('VERIFIED_PRODUCTION_DOMAIN_REQUIRED');
  return `https://${domain.name}`;
}

export function authPatch(existing, origin) {
  const previous = (existing.uri_allow_list ?? '').split(',').map(x => x.trim()).filter(Boolean);
  return {site_url: origin, uri_allow_list: [...new Set([...previous,
    `${origin}/auth/callback`, `${origin}/auth/callback?next=/reset-password`])].join(',')};
}

export function environmentValues(target, origin, env) {
  const values = {
    NEXT_PUBLIC_SUPABASE_URL: target.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: target.supabasePublishableKey,
    APP_URL: origin,
  };
  if (env.GEMINI_API_KEY) Object.assign(values, {
    AI_PROVIDER: 'gemini', GEMINI_API_KEY: env.GEMINI_API_KEY, GEMINI_TEXT_MODEL: env.GEMINI_TEXT_MODEL,
    AI_REQUEST_TIMEOUT_MS: '30000', AI_MAX_REQUESTS_PER_HOUR: '10',
    AI_MAX_OUTPUT_TOKENS: '1500', AI_PROMPT_VERSION: 'inventory-insights-v1',
  });
  // Do not erase existing optional AI configuration when no replacement is supplied.
  return Object.entries(values).map(([key, value]) => ({key, value,
    type: key === 'GEMINI_API_KEY' ? 'encrypted' : 'plain', target: ['production']}));
}

export async function smokeHttp(origin, transport = globalThis.fetch) {
  const cases = [
    ['/', 200, /Smart Inventory/i], ['/login', 200, /Email address/i],
    ['/register', 200, /Store name/i], ['/forgot-password', 200, /Email address/i],
    ['/api/catalog?kind=products', 401], ['/api/reports/inventory/export', 401],
    ['/api/insights', 401],
  ];
  const passed = [];
  for (const [path, status, content] of cases) {
    const response = await transport(new URL(path, origin), {
      redirect: 'manual', signal: globalThis.AbortSignal.timeout(20000),
    });
    if (response.status !== status) reject(`LIVE_HTTP_CHECK_FAILED:${path}:${response.status}`);
    if (content && !content.test(await response.text())) reject(`LIVE_CONTENT_CHECK_FAILED:${path}`);
    passed.push(path);
  }
  const protectedPage = await transport(`${origin}/dashboard`, {redirect: 'manual', signal: globalThis.AbortSignal.timeout(20000)});
  const location = protectedPage.headers.get('location');
  const destination = location ? new URL(location, origin) : null;
  if (![302,303,307,308].includes(protectedPage.status) || destination?.origin !== origin ||
      destination?.pathname !== '/login') reject('LIVE_AUTH_REDIRECT_FAILED');
  passed.push('/dashboard');
  return passed;
}

export async function deploy(target, env, {transport = globalThis.fetch, sleep = delay, record = async () => {}} = {}) {
  validateTarget(target, env);
  const report = {state: 'preflight', source_commit: env.GITHUB_SHA, target: target.supabaseProjectRef,
    tests: [], remaining: ['Hosted authenticated Purchase/POS browser journey', 'Email delivery verification', 'Real Gemini generation'],
    database_changes: 'none; migrations and legacy archives are not touched'};
  await record(report);
  async function api(service, path, method = 'GET', body, allowMissing = false) {
    const origin = service === 'vercel' ? 'https://api.vercel.com' : 'https://api.supabase.com';
    const url = new URL(path, origin);
    if (url.origin !== origin) reject('API_ORIGIN_REJECTED');
    if (service === 'vercel') url.searchParams.set('teamId', target.vercelTeamId);
    const token = service === 'vercel' ? env.VERCEL_TOKEN : env.SUPABASE_ACCESS_TOKEN;
    // No automatic replay of external writes whose outcome may be unknown.
    let response;
    try { response = await transport(url, {method, redirect: 'error', signal: globalThis.AbortSignal.timeout(30000),
      headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
      ...(body === undefined ? {} : {body: JSON.stringify(body)})}); }
    catch { reject(`API_NETWORK_OUTCOME_UNKNOWN:${service}:${method}`); }
    if (response.status === 404 && allowMissing) return null;
    if (!response.ok) reject(`API_REJECTED:${service}:${response.status}`);
    try { return await response.json(); } catch { reject(`API_INVALID_RESPONSE:${service}`); }
  }
  const hosted = await api('supabase', `/v1/projects/${target.supabaseProjectRef}`);
  if (hosted.id !== target.supabaseProjectRef || hosted.name !== target.supabaseProjectName ||
      hosted.organization_id !== target.supabaseOrganizationId || hosted.status !== 'ACTIVE_HEALTHY') reject('HOSTED_TARGET_MISMATCH');
  const previousAuth = await api('supabase', `/v1/projects/${target.supabaseProjectRef}/config/auth`);
  const authSettings = await transport(`${target.supabaseUrl}/auth/v1/settings`, {
    headers: {apikey: target.supabasePublishableKey}, redirect: 'error', signal: globalThis.AbortSignal.timeout(20000),
  });
  if (!authSettings.ok) reject('SUPABASE_PUBLIC_KEY_CHECK_FAILED');
  report.tests.push('Approved Supabase project and publishable key verified');
  let project = await api('vercel', `/v9/projects/${target.vercelProjectName}`, 'GET', undefined, true);
  if (!project) {
    project = await api('vercel', '/v11/projects', 'POST', {name: target.vercelProjectName,
      framework: 'nextjs', nodeVersion: '22.x',
      gitRepository: {type: 'github', repo: target.repository}});
  }
  if (project.name !== target.vercelProjectName || project.accountId !== target.vercelTeamId ||
      project.link?.type !== 'github' || String(project.link?.repoId) !== target.repositoryId ||
      !/^prj_[a-zA-Z0-9]+$/.test(project.id)) reject('VERCEL_PROJECT_OR_REPOSITORY_MISMATCH');
  report.project_id = project.id;
  const domains = await api('vercel', `/v9/projects/${project.id}/domains?limit=100`);
  const origin = selectOrigin(domains.domains ?? [], env.APP_URL);
  report.url = origin;
  const result = await api('vercel', `/v10/projects/${project.id}/env?upsert=true`, 'POST', environmentValues(target, origin, env));
  if (result.failed?.length) reject('ENVIRONMENT_UPSERT_FAILED');
  report.state = 'configured';
  await record(report);
  const started = await api('vercel', '/v13/deployments', 'POST', {
    name: project.name, project: project.id, target: 'production',
    gitSource: {type: 'github', repoId: target.repositoryId, ref: env.GITHUB_SHA},
    projectSettings: {framework: 'nextjs', nodeVersion: '22.x'},
    meta: {releaseSource: 'smart-inventory-release-workflow', sourceCommit: env.GITHUB_SHA},
  });
  if (!/^dpl_[a-zA-Z0-9]+$/.test(started.id ?? '')) reject('DEPLOYMENT_ID_MISSING');
  report.deployment_id = started.id; report.state = 'building'; await record(report);
  let deployment = started;
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = deployment.readyState ?? deployment.status;
    if (state === 'READY') break;
    if (['ERROR', 'CANCELED'].includes(state)) reject(`VERCEL_BUILD_${state}`);
    await sleep(6000);
    deployment = await api('vercel', `/v13/deployments/${started.id}`);
  }
  if ((deployment.readyState ?? deployment.status) !== 'READY') reject('VERCEL_BUILD_TIMEOUT');
  if (deployment.projectId !== project.id || !deployment.alias?.includes(new URL(origin).hostname)) reject('PRODUCTION_ALIAS_NOT_CONFIRMED');
  report.state = 'ready'; await record(report);
  // Change only callback origins AFTER a confirmed deployment. Preserve SMTP, confirmations and all other Auth settings.
  const patch = authPatch(previousAuth, origin);
  await api('supabase', `/v1/projects/${target.supabaseProjectRef}/config/auth`, 'PATCH', patch);
  const savedAuth = await api('supabase', `/v1/projects/${target.supabaseProjectRef}/config/auth`);
  const savedUrls = (savedAuth.uri_allow_list ?? '').split(',').map(x => x.trim());
  if (savedAuth.site_url !== origin || !patch.uri_allow_list.split(',').every(x => savedUrls.includes(x))) reject('AUTH_CALLBACK_CONFIGURATION_NOT_VERIFIED');
  report.auth_urls_configured = true;
  report.custom_smtp_configured = Boolean(savedAuth.smtp_host);
  report.tests.push('Production alias confirmed', 'Supabase site URL and exact callbacks verified');
  report.tests.push(...await smokeHttp(origin, transport));
  report.state = 'deployed_http_verified';
  if (!savedAuth.smtp_host) report.remaining.push('Configure custom SMTP before general public registration');
  await record(report);
  return report;
}

async function main() {
  const target = JSON.parse(await readFile(new URL('../config/deployment-target.json', import.meta.url), 'utf8'));
  await mkdir('test-results', {recursive: true});
  const record = async report => writeFile('test-results/deployment.json', JSON.stringify(report, null, 2) + '\n');
  const report = await deploy(target, process.env, {record});
  const text = `## Vercel release\n\nURL: ${report.url}\nDeployment: ${report.deployment_id}\nSource: ${report.source_commit}\n\nRead-only HTTP checks passed. Authenticated business/email/provider tests are separate release gates.\n\nRemaining: ${report.remaining.join('; ')}\n`;
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text);
  process.stdout.write(text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async error => {
    const code = error instanceof ReleaseError ? error.message : 'RELEASE_TOOL_ERROR';
    process.stderr.write(`Release stopped: ${code}\n`);
    if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
      `\nRelease stopped: ${code}. No successful deployment is claimed. See the saved deployment state, when present.\n`);
    process.exitCode = 1;
  });
}
