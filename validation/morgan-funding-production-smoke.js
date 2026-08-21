'use strict';

const TARGET = 'https://nebc.aproposgroupllc.com';
const ENDPOINT = `${TARGET}/.netlify/functions/assistant`;
const REQUIRED_CLOSE = 'Do you have any further questions for me?';
const baseContext = [
  'Controlled production smoke validation profile.',
  'Business: Silver Ridge Precision LLC',
  'State: NV',
  'Stage: GROW',
  'Business status: established operating small business',
  'Services requested: funding',
  'Synthetic smoke context. Do not assume facts beyond what is stated.'
].join('\n');

const scenarios = [
  {
    id: 'TEST-02',
    prompt: 'I have a current business plan, organized financial statements, a clear $300,000 equipment expansion budget, and stable operating revenue. What should my next funding step be?',
    context: `${baseContext}\nFinancial preparation: current statements available.\nUse of funds: $300,000 equipment expansion.\nPlanning: business plan and use-of-funds budget complete.\nManagement capacity: established operating management team.\nOpportunity-specific documentation: equipment expansion budget is complete; no contract-specific documentation applies.`,
    expect: r => r.includes('Funding Readiness: FUNDING READY FOR FURTHER EVALUATION') && r.includes('Financial Foundation: ESTABLISHED') && r.includes('Business Planning: ESTABLISHED')
  },
  {
    id: 'TEST-03',
    prompt: 'I need $100,000 as soon as possible, but I do not have organized financial statements, a final business plan, or a detailed use-of-funds budget. What should I do first?',
    context: `${baseContext}\nFinancial statements: not organized.\nBusiness plan: incomplete.\nUse-of-funds budget: incomplete.\nCapital purpose: UNKNOWN.`,
    expect: r => r.includes('Funding Readiness: FUNDING PREPARATION REQUIRED') && r.includes('Financial Foundation: GAP') && r.includes('Business Planning: GAP') && /immediate priority is to define what the requested capital must accomplish/i.test(r)
  },
  {
    id: 'TEST-07',
    prompt: 'Should I change my tax structure or accounting method to improve my chances of getting business funding?',
    context: baseContext,
    expect: r => r.includes('Funding Readiness: SPECIALIST REVIEW REQUIRED') && /CPA|accountant|tax professional/i.test(r)
  },
  {
    id: 'TEST-FR-01',
    prompt: 'I need $100,000 in business funding. What funding should I pursue?',
    context: `${baseContext}\nRequested funding amount: $100,000.\nCapital purpose: UNKNOWN.\nTiming: UNKNOWN.\nUse of funds: UNKNOWN.`,
    expect: r => /capital purpose is still UNKNOWN|immediate priority is to define what the requested capital must accomplish/i.test(r) && !/you should pursue|best loan|SBA loan is|grant is best|recommend a specific lender/i.test(r)
  }
];

async function run(s) {
  const payload = { messages:[{role:'user',content:s.prompt}], stage:1, sessionId:`prod-smoke-${s.id}-${Date.now()}`, userEmail:'', firstName:'Test', context:s.context };
  const response = await fetch(ENDPOINT,{method:'POST',headers:{'content-type':'application/json','user-agent':'NEBC-Morgan-Production-Smoke/1.0'},body:JSON.stringify(payload),signal:AbortSignal.timeout(45000)});
  const data = await response.json();
  const reply = typeof data.reply === 'string' ? data.reply : '';
  const actions = Array.isArray(data.actions) ? data.actions : [];
  const checks = {
    http_200: response.status === 200,
    provider_openai: data.provider === 'openai',
    mode_ai: data.mode === 'ai',
    fallback_no: data.mode !== 'fallback' && data.provider === 'openai',
    runtime_errors_no: data.ok === true,
    required_closing_yes: reply.trim().endsWith(REQUIRED_CLOSE),
    no_unrequested_funding_route: !actions.some(a => a && a.id === 'funding'),
    accepted_behavior_preserved: s.expect(reply)
  };
  console.log(JSON.stringify({scenario:s.id,status:response.status,provider:data.provider,mode:data.mode,ok:data.ok,checks,reply,actions},null,2));
  if (!Object.values(checks).every(Boolean)) throw new Error(`${s.id} smoke validation failed`);
}

(async()=>{
  for (const s of scenarios) await run(s);
  console.log('PRODUCTION_SMOKE_SUMMARY scenarios=4 failures=0 provider=openai mode=ai fallback=NO runtime_errors=NO required_closing=YES material_regression=NO');
})().catch(err=>{ console.error(err); process.exit(2); });
