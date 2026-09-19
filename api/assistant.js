import {AppError,assert,validateConfig} from '../src/core.js';
import {provider,readJson} from './_lib/ai.js';
export function createHandler(env=process.env,fetcher=globalThis.fetch){return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(req.method!=='POST'){res.setHeader('Allow','POST');throw new AppError('Use POST.','METHOD',405);}
    if(!String(req.headers['content-type']||'').startsWith('application/json'))throw new AppError('Use application/json.','CONTENT_TYPE',415);
    const origin=req.headers.origin;if(origin){let host;try{host=new URL(origin).host;}catch{throw new AppError('Invalid origin.','ORIGIN',403);}if(host!==req.headers.host)throw new AppError('Cross-origin request rejected.','ORIGIN',403);}
    const match=/^Bearer ([^\s]+)$/.exec(req.headers.authorization||'');if(!match||match[1].length>4096)throw new AppError('Sign in to use the assistant.','AUTH',401);
    if(Number(req.headers['content-length'])>32768)throw new AppError('Request is too large.','SIZE',413);
    let body=req.body;if(typeof body==='string'){if(body.length>32768)throw new AppError('Request is too large.','SIZE',413);try{body=JSON.parse(body);}catch{throw new AppError('Invalid JSON.');}}
    assert(body&&typeof body==='object'&&!Array.isArray(body),'Invalid request.');assert(JSON.stringify(body).length<=32768,'Request is too large.');
    const {task,org_id}=body;assert(['purchase','insights'].includes(task),'Unknown assistant task.');assert(typeof org_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(org_id),'Invalid workspace.');
    const text=typeof body.text==='string'?body.text.trim():'';if(task==='purchase')assert(text.length>0&&text.length<=20000,'Provide 1–20,000 characters of receipt or purchase text.');
    let config;try{config=validateConfig(env.SUPABASE_URL,env.SUPABASE_PUBLISHABLE_KEY);}catch{throw new AppError('The server Supabase connection is not configured.','CONFIG',503);}
    const headers={apikey:config.supabaseKey,Authorization:`Bearer ${match[1]}`,'Content-Type':'application/json'};
    const user=await fetcher(config.supabaseUrl+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});if(!user.ok)throw new AppError('Your session is invalid or expired.','AUTH',401);
    const response=await fetcher(config.supabaseUrl+'/rest/v1/rpc/si_ai_context',{method:'POST',headers,body:JSON.stringify({p_org:org_id}),signal:AbortSignal.timeout(10000)});
    const context=await readJson(response);if(!response.ok){const limited=String(context.message||'').includes('hourly limit');throw new AppError(limited?'Assistant hourly limit reached. Try next hour.':'Workspace manager access is required.',limited?'RATE_LIMIT':'FORBIDDEN',limited?429:403);}
    const engine=provider(env,fetcher);const result=await engine.generate(task,{text},task==='insights'?{dashboard:{product_count:context.dashboard?.product_count,low_stock_count:context.dashboard?.low_stock_count,stock_units:context.dashboard?.stock_units},low_stock:context.low_stock}:{});
    res.status(200).json({version:1,provider:engine.name,review_required:true,result});
  }catch(error){const known=error instanceof AppError;res.status(known?error.status:error.name==='TimeoutError'?504:502).json({error:known?error.message:error.name==='TimeoutError'?'Assistant request timed out. No stock was changed.':'Assistant is temporarily unavailable. No stock was changed.',code:known?error.code:'PROVIDER'});}
};}
export default createHandler();
