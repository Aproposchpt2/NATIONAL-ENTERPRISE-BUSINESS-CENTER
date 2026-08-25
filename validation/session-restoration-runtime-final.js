'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGET = 'https://deploy-preview-40--nat-enterprise-business-center.netlify.app';
const FIXTURE = 'https://deploy-preview-40--nat-enterprise-business-center.netlify.app/.netlify/functions/session-restoration-test-fixture';
const EXPECTED_CLOSE = 'Do you have any further questions for me?';
const IMPL_COMMIT = 'bd3a09e2676d3fe628c4e11e9f9971195b19ecf4';

async function postUrl(url, body) {
  const r = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch (_) { data = { raw:text }; }
  return { status:r.status, data };
}
async function post(fn, body){ return postUrl(`${TARGET}/.netlify/functions/${fn}`, body); }
async function waitForFixture(){
  let last='';
  for(let i=0;i<36;i++){
    try{
      const r=await postUrl(FIXTURE,{operation:'cleanup'});
      if(r.status===200 && r.data && r.data.ok) return true;
      last=`HTTP ${r.status}`;
    }catch(e){ last=e.message; }
    await new Promise(r=>setTimeout(r,5000));
  }
  throw new Error(`fixture preview unavailable: ${last}`);
}
function restoration(body){ return body && body.member && body.member.morganRestoration; }
function countMessage(messages, exact){ return (messages||[]).filter(m=>m.content===exact).length; }

(async()=>{
  const evidence={target:TARGET,fixture:FIXTURE,implementationCommit:IMPL_COMMIT,startedAt:new Date().toISOString(),scenarios:{},errors:[]};
  let failed=false;
  try{
    await waitForFixture();
    const setup=await postUrl(FIXTURE,{operation:'setup'});
    evidence.fixtureSetup={status:setup.status,ok:setup.data?.ok===true,error:setup.data?.error||null,diagnostic:setup.data?.diagnostic||null};
    if(setup.status!==200||!setup.data?.ok) throw new Error('fixture setup failed');
    const {codes,emails,sessions}=setup.data;

    const abUser='SR-AB first-session marker';
    const abSave=await post('assistant',{messages:[{role:'user',content:abUser}],stage:1,sessionId:sessions.ab,userEmail:emails.ab,firstName:'SR',context:'Synthetic SR-A/B validation. Business: SR AB Test Co. State: NV.'});
    const abVerify=await post('member-otp-verify',{email:emails.ab,code:codes.ab});
    const abRest=restoration(abVerify.data);
    const srA=abSave.status===200&&abSave.data?.mode==='ai'&&abSave.data?.provider==='openai'&&abSave.data?.reply?.trim().endsWith(EXPECTED_CLOSE);
    const srB=abVerify.status===200&&abVerify.data?.ok===true&&abRest?.status==='restored'&&abRest.session?.sessionId===sessions.ab&&abRest.session.messages?.some(m=>m.content===abUser);
    evidence.scenarios['SR-A']={pass:srA,assistantStatus:abSave.status,provider:abSave.data?.provider,mode:abSave.data?.mode,closing:!!abSave.data?.reply?.trim().endsWith(EXPECTED_CLOSE),sessionId:sessions.ab};
    evidence.scenarios['SR-B']={pass:srB,verifyStatus:abVerify.status,restoreStatus:abRest?.status,sessionMatch:abRest?.session?.sessionId===sessions.ab,messageRestored:!!abRest?.session?.messages?.some(m=>m.content===abUser),browserStateRequired:false};
    if(!srA||!srB) failed=true;

    const cVerify=await post('member-otp-verify',{email:emails.c,code:codes.c});
    const cRest=restoration(cVerify.data);
    const srC=cVerify.status===200&&cRest?.status==='restored'&&cRest.session?.sessionId===sessions.c&&cRest.session.messages?.[0]?.content==='SR-C prior message';
    evidence.scenarios['SR-C']={pass:srC,verifyStatus:cVerify.status,restoreStatus:cRest?.status,sessionMatch:cRest?.session?.sessionId===sessions.c,priorMessage:cRest?.session?.messages?.[0]?.content||null};
    if(!srC) failed=true;

    const dbVerify=await post('member-otp-verify',{email:emails.db,code:codes.db});
    const dbRest=restoration(dbVerify.data);
    const dbText=JSON.stringify(dbVerify.data||{});
    const srD=dbVerify.status===200&&dbVerify.data?.ok===true&&dbRest?.status==='none'&&!dbText.includes('Member A')&&!dbText.includes('SR-DA');
    evidence.scenarios['SR-D']={pass:srD,verifyStatus:dbVerify.status,restoreStatus:dbRest?.status,crossMemberHistoryObserved:dbText.includes('Member A')||dbText.includes('SR-DA')};
    if(!srD) failed=true;

    const eVerify1=await post('member-otp-verify',{email:emails.e,code:codes.e});
    const eRest1=restoration(eVerify1.data);
    const before=eRest1?.session?.messages||[];
    const newUser='SR-E continuation message';
    const eSend=await post('assistant',{messages:[...before,{role:'user',content:newUser}],stage:2,sessionId:sessions.e,userEmail:emails.e,firstName:'SR',context:'Returning synthetic SR-E validation member.'});
    const refresh=await postUrl(FIXTURE,{operation:'refresh',key:'e'});
    const eVerify2=await post('member-otp-verify',{email:emails.e,code:codes.e});
    const eRest2=restoration(eVerify2.data);
    const after=eRest2?.session?.messages||[];
    const srE=eVerify1.status===200&&eRest1?.status==='restored'&&eSend.status===200&&eSend.data?.mode==='ai'&&refresh.status===200&&eVerify2.status===200&&eRest2?.status==='restored'&&eRest2.session?.sessionId===sessions.e&&countMessage(after,'SR-E prior message')===1&&countMessage(after,newUser)===1&&after.length===before.length+2;
    evidence.scenarios['SR-E']={pass:srE,initialCount:before.length,finalCount:after.length,sessionStable:eRest2?.session?.sessionId===sessions.e,originalCount:countMessage(after,'SR-E prior message'),newUserCount:countMessage(after,newUser),provider:eSend.data?.provider,mode:eSend.data?.mode,closing:!!eSend.data?.reply?.trim().endsWith(EXPECTED_CLOSE)};
    if(!srE) failed=true;

    const fVerify=await post('member-otp-verify',{email:emails.f,code:codes.f});
    const fRest=restoration(fVerify.data);
    const srF=fVerify.status===200&&fVerify.data?.ok===true&&fRest?.status==='none'&&fRest?.session==null;
    evidence.scenarios['SR-F']={pass:srF,verifyStatus:fVerify.status,restoreStatus:fRest?.status,session:fRest?.session??null};
    if(!srF) failed=true;
  }catch(e){
    evidence.errors.push(e.message||String(e)); failed=true;
  }finally{
    try{ const clean=await postUrl(FIXTURE,{operation:'cleanup'}); evidence.cleanup={status:clean.status,ok:clean.data?.ok===true}; }catch(e){ evidence.cleanup={status:null,ok:false,error:e.message}; }
  }
  evidence.completedAt=new Date().toISOString();
  fs.mkdirSync(path.join(process.cwd(),'validation-artifacts'),{recursive:true});
  fs.writeFileSync(path.join(process.cwd(),'validation-artifacts','session-restoration-runtime-final.json'),JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
  if(failed) process.exitCode=1;
})();
