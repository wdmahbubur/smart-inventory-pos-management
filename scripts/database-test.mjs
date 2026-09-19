import { readdir, readFile } from 'node:fs/promises';
import { spawnSync, spawn } from 'node:child_process';
import assert from 'node:assert/strict';
const url = process.env.DATABASE_TEST_URL;
if (!url) { console.error('BLOCKED: DATABASE_TEST_URL is missing. Use a disposable local PostgreSQL database.'); process.exit(2); }
const parsed = new URL(url);
if (!['127.0.0.1','localhost'].includes(parsed.hostname) || parsed.pathname !== '/smart_inventory_test') throw new Error('Safety guard: only local smart_inventory_test is allowed.');
function sql(input, quiet = false) { const r=spawnSync('psql',[url,'-X','-v','ON_ERROR_STOP=1',...(quiet?['-A','-t']:[])], { input,encoding:'utf8' }); if(r.error) throw r.error; if(r.status) throw new Error(r.stderr); if(!quiet) process.stdout.write(r.stdout+r.stderr); return r.stdout.trim(); }
if (process.env.CI) sql(await readFile('tests/sql/bootstrap.sql','utf8'));
for(const f of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) sql(await readFile(`supabase/migrations/${f}`,'utf8'));
sql(await readFile('tests/sql/integration.sql','utf8'));
const fixture=JSON.parse(sql(`insert into auth.users(id,email) values('00000000-0000-4000-8000-000000000004','concurrency@example.test');
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);
with o as (select public.si_bootstrap('Concurrent','BDT','UTC',gen_random_uuid()) j) select j from o;`,true).split('\n').at(-1));
const auth=`set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',false);`;
const p=JSON.parse(sql(`${auth} select public.si_mutate('${fixture.id}','product_save','{"name":"Last unit","sku":"LAST","price_minor":100}',gen_random_uuid());`,true).split('\n').at(-1));
sql(`${auth} select public.si_mutate('${fixture.id}','stock_adjust','{"id":"${p.id}","delta":1,"reason":"Concurrency fixture"}',gen_random_uuid());`,true);
const payload=JSON.stringify({lines:[{product_id:p.id,quantity:1}],payment_method:'cash',expected_total_minor:100,tendered_minor:100});
function concurrent(key='gen_random_uuid()') {return new Promise(resolve=> {const c=spawn('psql',[url,'-X','-v','ON_ERROR_STOP=1','-A','-t']);let output='';c.stdout.on('data',x=>output+=x);c.stderr.on('data',x=>output+=x);c.on('close',code=>resolve({code,output}));c.stdin.end(`${auth} select public.si_mutate('${fixture.id}','sale_checkout','${payload}',${key});`);});}
const results=await Promise.all([concurrent(),concurrent()]);
assert.equal(results.filter(r=>r.code===0).length,1,'exactly one competing checkout succeeds');
assert.ok(results.find(r=>r.code!==0).output.includes('Insufficient stock'));
assert.equal(Number(sql(`${auth} select stock from public.si_products where id='${p.id}';`,true).split('\n').at(-1)),0);
sql(`${auth} select public.si_mutate('${fixture.id}','stock_adjust','{"id":"${p.id}","delta":1,"reason":"Idempotency fixture"}',gen_random_uuid());`,true);
const key="'10000000-0000-4000-8000-000000000099'";
const retries=await Promise.all([concurrent(key),concurrent(key)]);
assert.ok(retries.every(r=>r.code===0));
assert.equal(JSON.parse(retries[0].output.trim().split('\n').at(-1)).id,JSON.parse(retries[1].output.trim().split('\n').at(-1)).id);
assert.equal(Number(sql(`${auth} select stock from public.si_products where id='${p.id}';`,true).split('\n').at(-1)),0);
console.log('PASS: concurrent oversell prevention and same-key concurrent idempotency.');
