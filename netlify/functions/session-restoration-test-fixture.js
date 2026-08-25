'use strict';

// VALIDATION-ONLY deploy-preview fixture. Fixed synthetic rows only.
// This function is never intended for merge into the implementation branch.
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const CORS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const EMAILS = {
  ab: 'nebc.sr.ab.p39.20260825@example.invalid',
  c: 'nebc.sr.c.p39.20260825@example.invalid',
  da: 'nebc.sr.da.p39.20260825@example.invalid',
  db: 'nebc.sr.db.p39.20260825@example.invalid',
  e: 'nebc.sr.e.p39.20260825@example.invalid',
  f: 'nebc.sr.f.p39.20260825@example.invalid',
};
const CODES = { ab:'510001', c:'510002', da:'510003', db:'510004', e:'510005', f:'510006' };
const SESSIONS = {
  ab:'30000000-0000-4000-8000-000000000001',
  c:'30000000-0000-4000-8000-000000000002',
  da:'30000000-0000-4000-8000-000000000003',
  e:'30000000-0000-4000-8000-000000000005',
};
const keys = Object.keys(EMAILS);

function headers(){ return { apikey:SKEY, Authorization:`Bearer ${SKEY}`, 'Content-Type':'application/json' }; }
function tableLabel(path){ return String(path).startsWith('morgan_sessions') ? 'morgan_sessions' : String(path).startsWith('biz_center_members') ? 'biz_center_members' : 'unknown'; }
async function req(path, opts={}){
  const r = await fetch(`${SUPA.replace(/\/$/,'')}/rest/v1/${path}`, { ...opts, headers:{...headers(), ...(opts.headers||{})} });
  const text = await r.text();
  if(!r.ok) throw new Error(`${tableLabel(path)}:${r.status}`);
  return text ? JSON.parse(text) : null;
}
async function cleanup(){
  for(const email of Object.values(EMAILS)){
    await req(`morgan_sessions?user_email=eq.${encodeURIComponent(email)}`, {method:'DELETE', headers:{Prefer:'return=minimal'}}).catch(()=>{});
    await req(`biz_center_members?email=eq.${encodeURIComponent(email)}`, {method:'DELETE', headers:{Prefer:'return=minimal'}}).catch(()=>{});
  }
}
async function member(key){
  const email=EMAILS[key];
  const row={full_name:`SR ${key.toUpperCase()} Tester`,email,business_name:`SR ${key.toUpperCase()} Test Co`,state:'NV',business_stage:'GROW',readiness_score:70,business_status:['registered'],services_needed:['funding'],agent_context:`Synthetic SR-${key.toUpperCase()} validation member`,subscription_status:'active',login_code:CODES[key],login_code_expires:new Date(Date.now()+60*60*1000).toISOString()};
  await req('biz_center_members',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
}
async function refresh(key){
  if(!keys.includes(key)) throw new Error('fixture_key:400');
  await req(`biz_center_members?email=eq.${encodeURIComponent(EMAILS[key])}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({login_code:CODES[key],login_code_expires:new Date(Date.now()+60*60*1000).toISOString()})});
}
async function session(key, marker){
  if(!SESSIONS[key]) return;
  const row={id:SESSIONS[key],user_email:EMAILS[key],stage:'1',messages:[{role:'user',content:`${marker} prior message`},{role:'assistant',content:`${marker} prior reply. Do you have any further questions for me?`}],updated_at:new Date().toISOString()};
  await req('morgan_sessions',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify(row)});
}

exports.handler=async(event)=>{
  if(event.httpMethod!=='POST') return {statusCode:405,headers:CORS,body:JSON.stringify({error:'POST only'})};
  if(!SUPA||!SKEY) return {statusCode:503,headers:CORS,body:JSON.stringify({error:'fixture unavailable'})};
  let body={}; try{body=JSON.parse(event.body||'{}')}catch{return {statusCode:400,headers:CORS,body:JSON.stringify({error:'bad request'})}}
  try{
    if(body.operation==='cleanup'){
      await cleanup();
      return {statusCode:200,headers:CORS,body:JSON.stringify({ok:true,operation:'cleanup'})};
    }
    if(body.operation==='refresh'){
      await refresh(String(body.key||''));
      return {statusCode:200,headers:CORS,body:JSON.stringify({ok:true,operation:'refresh'})};
    }
    if(body.operation!=='setup') return {statusCode:400,headers:CORS,body:JSON.stringify({error:'unsupported operation'})};
    await cleanup();
    for(const key of keys) await member(key);
    await session('c','SR-C');
    await session('da','SR-DA');
    await session('e','SR-E');
    return {statusCode:200,headers:CORS,body:JSON.stringify({ok:true,operation:'setup',codes:CODES,emails:EMAILS,sessions:SESSIONS})};
  }catch(e){
    return {statusCode:500,headers:CORS,body:JSON.stringify({error:'fixture operation failed',diagnostic:String(e&&e.message||'unknown')})};
  }
};
