'use strict';

// VALIDATION-ONLY deploy-preview fixture. Fixed synthetic member identities only.
// Session UUIDs are generated internally per fixture runtime to avoid collisions.
// Never merge into implementation. Credential diagnostics expose booleans/known claims only.
const { randomUUID } = require('node:crypto');
const SUPA = process.env.SUPABASE_URL;
const SKEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const CORS = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const TARGET_REF = 'judislfknmhofcgzyozc';
const EMAILS = {
  ab: 'nebc.sr.ab.p39.20260825@example.invalid',
  c: 'nebc.sr.c.p39.20260825@example.invalid',
  da: 'nebc.sr.da.p39.20260825@example.invalid',
  db: 'nebc.sr.db.p39.20260825@example.invalid',
  e: 'nebc.sr.e.p39.20260825@example.invalid',
  f: 'nebc.sr.f.p39.20260825@example.invalid',
};
const CODES = { ab:'510001', c:'510002', da:'510003', db:'510004', e:'510005', f:'510006' };
let SESSIONS = makeSessions();
const keys = Object.keys(EMAILS);

function makeSessions(){
  return { ab:randomUUID(), c:randomUUID(), da:randomUUID(), e:randomUUID() };
}
function headers(){ return { apikey:SKEY, Authorization:`Bearer ${SKEY}`, 'Content-Type':'application/json' }; }
function tableLabel(path){ return String(path).startsWith('morgan_sessions') ? 'morgan_sessions' : String(path).startsWith('biz_center_members') ? 'biz_center_members' : 'unknown'; }
function decodeJwtPayload(value){
  if (typeof value !== 'string' || value.split('.').length !== 3) return null;
  try {
    const part = value.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_) { return null; }
}
function credentialDiagnostic(){
  const present = typeof SKEY === 'string' && SKEY.length > 0;
  const empty = !present;
  const placeholder = present && (/^\*+$/.test(SKEY) || SKEY.includes('****************') || SKEY === '[REDACTED]' || SKEY === 'REDACTED');
  const jwt = decodeJwtPayload(SKEY);
  const jwtLike = Boolean(jwt);
  const newSecretFormat = present && SKEY.startsWith('sb_secret_');
  return {
    variablePresent: present,
    variableEmpty: empty,
    maskedOrPlaceholder: placeholder,
    availableToServerFunction: present,
    recognizableCredentialFormat: jwtLike || newSecretFormat,
    jwtServiceRoleClaim: jwtLike ? jwt.role === 'service_role' : null,
    jwtProjectRefMatchesTarget: jwtLike && typeof jwt.ref === 'string' ? jwt.ref === TARGET_REF : null,
    jwtExpired: jwtLike && Number.isFinite(Number(jwt.exp)) ? Number(jwt.exp) * 1000 <= Date.now() : null,
  };
}
async function req(path, opts={}){
  const r = await fetch(`${SUPA.replace(/\/$/,'')}/rest/v1/${path}`, { ...opts, headers:{...headers(), ...(opts.headers||{})} });
  const text = await r.text();
  if(!r.ok) throw new Error(`${tableLabel(path)}:${r.status}`);
  return text ? JSON.parse(text) : null;
}
async function authProbe(table){
  const r = await fetch(`${SUPA.replace(/\/$/,'')}/rest/v1/${table}?select=*&limit=0`, { headers: headers() });
  return { table, status: r.status, authorized: r.ok };
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
  let body={}; try{body=JSON.parse(event.body||'{}')}catch{return {statusCode:400,headers:CORS,body:JSON.stringify({error:'bad request'})}}
  if(body.operation==='diagnose'){
    const credential = credentialDiagnostic();
    let urlParse = false;
    try { new URL(SUPA || ''); urlParse = true; } catch (_) {}
    const result = { ok:true, urlParse, credential, targetProjectRef:TARGET_REF, probes:[] };
    if (urlParse && credential.variablePresent && !credential.maskedOrPlaceholder) {
      result.probes.push(await authProbe('biz_center_members').catch(()=>({table:'biz_center_members',status:0,authorized:false})));
      result.probes.push(await authProbe('morgan_sessions').catch(()=>({table:'morgan_sessions',status:0,authorized:false})));
    }
    return {statusCode:200,headers:CORS,body:JSON.stringify(result)};
  }
  if(!SUPA||!SKEY) return {statusCode:503,headers:CORS,body:JSON.stringify({error:'fixture unavailable'})};
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
    SESSIONS = makeSessions();
    for(const key of keys) await member(key);
    await session('c','SR-C');
    await session('da','SR-DA');
    await session('e','SR-E');
    return {statusCode:200,headers:CORS,body:JSON.stringify({ok:true,operation:'setup',codes:CODES,emails:EMAILS,sessions:SESSIONS})};
  }catch(e){
    return {statusCode:500,headers:CORS,body:JSON.stringify({error:'fixture operation failed',diagnostic:String(e&&e.message||'unknown')})};
  }
};
