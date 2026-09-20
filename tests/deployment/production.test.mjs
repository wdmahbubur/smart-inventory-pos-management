import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';
import {deploy, validateTarget, authPatch, environmentValues, selectOrigin, smokeHttp} from '../../scripts/deploy-production.mjs';
import {checkHostedPublic} from '../../scripts/check-hosted-public.mjs';

const target = JSON.parse(await readFile(new URL('../../config/deployment-target.json', import.meta.url), 'utf8'));
const env = {GITHUB_REPOSITORY:target.repository, GITHUB_REF:'refs/heads/master', GITHUB_SHA:'a'.repeat(40),
  VERCEL_TOKEN:'test-vercel-credential', SUPABASE_ACCESS_TOKEN:'test-supabase-credential'};
const origin = 'https://smart-inventory-pos-management.vercel.app';
const domain = {name: new URL(origin).hostname, verified:true};
const project = {name:target.vercelProjectName, id:'prj_test', accountId:target.vercelTeamId, link:{type:'github',repoId:target.repositoryId}};
const json = data => globalThis.Response.json(data);

test('absent deployment secrets abort before ANY network request', async () => {
  let calls=0;
  await assert.rejects(deploy(target,{...env,VERCEL_TOKEN:''},{transport:async()=>{calls++;return json({});}}),/SET_GITHUB_ACTIONS_SECRETS:VERCEL_TOKEN/);
  assert.equal(calls,0);
});
test('only the approved master repository, Supabase and Vercel team can deploy', () => {
  validateTarget(target,env);
  for(const patch of [{repository:'other/repository'},{supabaseProjectRef:'coolyerbbbmwabybajai'},{vercelTeamId:'team_other'},{supabaseUrl:'https://attacker.invalid'}])
    assert.throws(()=>validateTarget({...target,...patch},env),/UNAPPROVED_TARGET/);
  for(const patch of [{GITHUB_REF:'refs/pull/1/merge'},{GITHUB_REPOSITORY:'other/repository'},{GITHUB_SHA:'master'}])
    assert.throws(()=>validateTarget(target,{...env,...patch}),/UNAPPROVED_SOURCE/);
});
test('privileged and malformed public keys are rejected', () => {
  for(const key of ['sb_secret_bad','bad','e30.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.sig'])
    assert.throws(()=>validateTarget({...target,supabasePublishableKey:key},env),/PUBLIC_KEY_REQUIRED/);
});
test('APP_URL must be a verified, nonredirecting production domain owned by this project', () => {
  assert.equal(selectOrigin([domain]),origin);
  for(const value of ['http://smart-inventory-pos-management.vercel.app','https://attacker.invalid',origin+'/path',origin+':443/?bad',origin+'#hash'])
    assert.throws(()=>selectOrigin([domain],value));
  for(const extra of [{verified:false},{gitBranch:'preview'},{redirect:'https://other.invalid'},{customEnvironmentId:'env_staging'}])
    assert.throws(()=>selectOrigin([{...domain,...extra}]),/VERIFIED_PRODUCTION_DOMAIN_REQUIRED/);
});
test('Auth patch preserves existing redirects without changing confirmation, SMTP or sessions', () => {
  const before={uri_allow_list:'https://old.example/auth/callback',mailer_autoconfirm:false,smtp_host:'smtp.example'};
  const patch=authPatch(before,origin);
  assert.deepEqual(Object.keys(patch).sort(),['site_url','uri_allow_list']);
  assert.ok(patch.uri_allow_list.includes(before.uri_allow_list));
  assert.equal(authPatch(patch,origin).uri_allow_list,patch.uri_allow_list);
  assert.ok(patch.uri_allow_list.includes('/auth/callback?next=/reset-password'));
});
test('only client configuration reaches Vercel; optional AI provider keys stay server-only', () => {
  const values=environmentValues(target,origin,env);
  assert.equal(values.length,3);
  assert.ok(!JSON.stringify(values).includes(env.SUPABASE_ACCESS_TOKEN));
  assert.ok(!JSON.stringify(values).includes(env.VERCEL_TOKEN));

  const openrouter=environmentValues(target,origin,{...env,OPENROUTER_API_KEY:'test-openrouter-key'});
  assert.equal(openrouter.find(v=>v.key==='OPENROUTER_API_KEY').type,'encrypted');
  assert.equal(openrouter.find(v=>v.key==='AI_PROVIDER').value,'openrouter');
  assert.equal(openrouter.find(v=>v.key==='OPENROUTER_TEXT_MODEL').value,'nvidia/nemotron-3-ultra-550b-a55b:free');
  assert.ok(!openrouter.some(v=>v.key.startsWith('NEXT_PUBLIC_')&&v.value==='test-openrouter-key'));
  assert.throws(()=>validateTarget(target,{...env,OPENROUTER_API_KEY:'x',OPENROUTER_TEXT_MODEL:'bad model'}),/SET_OPENROUTER_TEXT_MODEL/);

  const gemini=environmentValues(target,origin,{...env,GEMINI_API_KEY:'test-gemini-key',GEMINI_TEXT_MODEL:'chosen-model'});
  assert.equal(gemini.find(v=>v.key==='GEMINI_API_KEY').type,'encrypted');
  assert.equal(gemini.find(v=>v.key==='AI_PROVIDER').value,'gemini');
  assert.throws(()=>validateTarget(target,{...env,GEMINI_API_KEY:'test-gemini-key'}),/SET_GEMINI_TEXT_MODEL/);
});

function fixture(overrides={}) {
  const calls=[];let lastPatch;
  const transport=async(input,options={})=>{
    const url=new URL(input),method=options.method??'GET';const body=options.body?JSON.parse(options.body):undefined;
    calls.push({url,method,body});
    if(url.hostname==='api.vercel.com'||url.hostname==='api.supabase.com') {
      assert.equal(options.redirect,'error');
      const expected=url.hostname==='api.vercel.com'?env.VERCEL_TOKEN:env.SUPABASE_ACCESS_TOKEN;
      assert.equal(options.headers.Authorization,`Bearer ${expected}`);
    } else assert.equal(options.headers?.Authorization,undefined);
    if(url.hostname==='api.vercel.com') {
      assert.equal(url.searchParams.get('teamId'),target.vercelTeamId);
      if(url.pathname==='/v11/projects')return json(project);
      if(url.pathname===`/v9/projects/${target.vercelProjectName}`)return overrides.missingProject?new globalThis.Response('{}',{status:404}):json(overrides.project??project);
      if(url.pathname.endsWith('/domains'))return json({domains:[domain]});
      if(url.pathname.endsWith('/env')){if(overrides.envNetworkError)throw new Error('transport included secret '+env.VERCEL_TOKEN);return json({failed:overrides.envFailed?[{}]:[]});}
      if(url.pathname==='/v13/deployments')return json({id:'dpl_test',readyState:'BUILDING'});
      if(url.pathname==='/v13/deployments/dpl_test')return json({id:'dpl_test',projectId:project.id,readyState:overrides.buildState??'READY',alias:overrides.alias??[domain.name]});
    }
    if(url.hostname==='api.supabase.com') {
      if(url.pathname.endsWith('/config/auth')) {
        if(method==='PATCH')lastPatch=body;
        return json({...lastPatch,smtp_host:'smtp.example'});
      }
      return json({id:target.supabaseProjectRef,name:target.supabaseProjectName,organization_id:target.supabaseOrganizationId,status:'ACTIVE_HEALTHY'});
    }
    if(url.origin===target.supabaseUrl)return json({external:{email:true}});
    if(url.pathname==='/dashboard')return new globalThis.Response(null,{status:307,headers:{location:'/login'}});
    if(url.pathname.startsWith('/api/'))return new globalThis.Response('{}',{status:401});
    return new globalThis.Response('Smart Inventory Email address Store name');
  };
  return {calls,transport,sleep:async()=>{}};
}

test('complete mocked deployment pins tested commit, verifies READY alias, configures Auth and checks live paths', async () => {
  const f=fixture();const states=[];
  const result=await deploy(target,env,{...f,record:async report=>states.push(report.state)});
  assert.equal(result.state,'deployed_http_verified');
  assert.equal(result.url,origin);assert.equal(result.tests.length,11);
  assert.deepEqual(states,['preflight','configured','building','ready','deployed_http_verified']);
  const creation=f.calls.find(c=>c.url.pathname==='/v13/deployments');
  assert.equal(creation.body.gitSource.ref,env.GITHUB_SHA);
  assert.equal(creation.body.target,'production');
  assert.ok(!f.calls.some(c=>/query|migration|signup|users|checkout|write_purchase/.test(c.url.pathname)));
});
test('creates a missing project only in the approved team linked to the approved repo', async () => {
  const f=fixture({missingProject:true});await deploy(target,env,f);
  const creation=f.calls.find(c=>c.url.pathname==='/v11/projects');
  assert.equal(creation.body.gitRepository.repo,target.repository);
  assert.equal(creation.body.nodeVersion,'22.x');
});
test('an unrelated existing project is never overwritten', async () => {
  const f=fixture({project:{...project,link:{type:'github',repoId:'wrong'}}});
  await assert.rejects(deploy(target,env,f),/VERCEL_PROJECT_OR_REPOSITORY_MISMATCH/);
  assert.ok(!f.calls.some(c=>c.method!=='GET'));
});
test('unknown outcome of environment writes is never blindly retried or logged with a credential', async () => {
  const f=fixture({envNetworkError:true});
  await assert.rejects(deploy(target,env,f),error=>error.message==='API_NETWORK_OUTCOME_UNKNOWN:vercel:POST');
  assert.equal(f.calls.filter(c=>c.url.pathname.endsWith('/env')).length,1);
});
test('partial environment upsert does not start a deployment', async () => {
  const f=fixture({envFailed:true});await assert.rejects(deploy(target,env,f),/ENVIRONMENT_UPSERT_FAILED/);
  assert.ok(!f.calls.some(c=>c.url.pathname==='/v13/deployments'));
});
test('failed build or incorrect production alias does not modify Supabase Auth', async () => {
  for(const overrides of [{buildState:'ERROR'},{alias:['some-other-project.vercel.app']}]) {
    const f=fixture(overrides);await assert.rejects(deploy(target,env,f));
    assert.ok(!f.calls.some(c=>c.method==='PATCH'));
  }
});
test('HTTP verification does not accept a setup page, fake auth or cross-origin redirect', async () => {
  await assert.rejects(smokeHttp(origin,async()=>new globalThis.Response('Connect your inventory database')),/LIVE_CONTENT_CHECK_FAILED/);
  const f=fixture();
  const transport=async(input,options)=>String(input).endsWith('/dashboard')?new globalThis.Response(null,{status:307,headers:{location:'https://other.invalid/login'}}):f.transport(input,options);
  await assert.rejects(smokeHttp(origin,transport),/LIVE_AUTH_REDIRECT_FAILED/);
});
test('public Supabase verification is read-only and denies all twelve tables and read RPCs', async () => {
  const calls=[];
  const transport=async(input,options)=>{
    calls.push({input:String(input),options});
    return String(input).endsWith('/settings')?json({external:{email:true}}):new globalThis.Response('{}',{status:401});
  };
  const result=await checkHostedPublic(target,transport);
  assert.equal(result.checks.length,15);assert.equal(calls.length,15);
  assert.ok(calls.filter(c=>c.options.method==='POST').every(c=>/rpc\/(get_workspace|get_insight_context)$/.test(c.input)));
});
test('public preflight rejects even an empty successful anonymous table response', async () => {
  await assert.rejects(checkHostedPublic(target,async()=>json({})),/ANON_READ_NOT_DENIED/);
});
