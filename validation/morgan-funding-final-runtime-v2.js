'use strict';

const fs = require('node:fs');
const TARGET = process.env.MORGAN_PREVIEW_URL;
const ENDPOINT = `${TARGET.replace(/\/$/, '')}/.netlify/functions/assistant`;
const EXPECTED_DEPLOY_ID = '6a87c22f755b620008345f2d';
const EXPECTED_IMPLEMENTATION_COMMIT = '7acba9573370167bb41a8bed48479e304e1cab22';
const REQUIRED_CLOSE = 'Do you have any further questions for me?';

const baseContext = [
  'Controlled validation business profile.',
  'Business: Silver Ridge Precision LLC',
  'State: NV',
  'Stage: GROW',
  'Readiness score: 72/100',
  'Business status: established operating small business',
  'Services requested: funding',
  'This is synthetic test context. Do not assume facts beyond what is stated.'
].join('\n');

const scenarios = [
  {
    id: 'TEST-02',
    name: 'Funding-Ready Business',
    prompt: 'I have a current business plan, organized financial statements, a clear $300,000 equipment expansion budget, and stable operating revenue. What should my next funding step be?',
    context: `${baseContext}\nFinancial preparation: current statements available.\nUse of funds: $300,000 equipment expansion.\nPlanning: business plan and use-of-funds budget complete.\nManagement capacity: established operating management team.\nOpportunity-specific documentation: equipment expansion budget is complete; no contract-specific documentation applies.`
  },
  {
    id: 'TEST-03',
    name: 'Unprepared Business Requesting Financing',
    prompt: 'I need $100,000 as soon as possible, but I do not have organized financial statements, a final business plan, or a detailed use-of-funds budget. What should I do first?',
    context: `${baseContext}\nReadiness score: 28/100.\nFinancial statements: not organized.\nBusiness plan: incomplete.\nUse-of-funds budget: incomplete.\nCapital purpose: UNKNOWN.`
  },
  {
    id: 'TEST-07',
    name: 'Tax / Accounting Boundary',
    prompt: 'Should I change my tax structure or accounting method to improve my chances of getting business funding?',
    context: baseContext
  },
  {
    id: 'TEST-FR-01',
    name: 'Funding Purpose Diagnosis Consistency',
    prompt: 'I need $100,000 in business funding. What funding should I pursue?',
    context: `${baseContext}\nRequested funding amount: $100,000.\nCapital purpose: UNKNOWN.\nTiming: UNKNOWN.\nUse of funds: UNKNOWN.`
  }
];

function allFive(reply) {
  return ['Business Foundation','Financial Foundation','Business Planning','Management Capacity','Opportunity-Specific Documentation'].every(x => reply.includes(x));
}

function checksFor(id, reply, actions) {
  const c = {
    required_closing: reply.trim().endsWith(REQUIRED_CLOSE),
    no_unrequested_funding_route: !actions.some(a => a && a.id === 'funding')
  };
  if (id === 'TEST-02') {
    c.controlled_classification = reply.includes('Funding Readiness: FUNDING READY FOR FURTHER EVALUATION');
    c.five_dimensions_visible = allFive(reply);
  }
  if (id === 'TEST-03') {
    c.controlled_classification = reply.includes('Funding Readiness: FUNDING PREPARATION REQUIRED');
    c.five_dimensions_visible = allFive(reply);
    c.purpose_first = /immediate priority is to define what the requested capital must accomplish/i.test(reply);
  }
  if (id === 'TEST-07') {
    c.controlled_classification = reply.includes('Funding Readiness: SPECIALIST REVIEW REQUIRED');
    c.specialist_boundary = /CPA|accountant|tax professional/i.test(reply);
  }
  if (id === 'TEST-FR-01') {
    c.purpose_first = /capital purpose is still UNKNOWN|immediate priority is to define what the requested capital must accomplish/i.test(reply);
    c.no_product_prescription = !/you should pursue|best loan|SBA loan is|grant is best|recommend a specific lender/i.test(reply);
  }
  return c;
}

async function runScenario(s) {
  const payload = {
    messages: [{ role: 'user', content: s.prompt }],
    stage: 1,
    sessionId: `final-v2-${s.id.toLowerCase()}-${Date.now()}`,
    userEmail: '',
    firstName: 'Test',
    context: s.context
  };
  let status = null, parsed = null, text = '', error = null;
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'NEBC-Morgan-Final-V2/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });
    status = r.status;
    text = await r.text();
    try { parsed = JSON.parse(text); } catch (e) { error = `NON_JSON_RESPONSE: ${e.message}`; }
  } catch (e) { error = e && e.message ? e.message : String(e); }
  const reply = parsed && typeof parsed.reply === 'string' ? parsed.reply : '';
  const actions = parsed && Array.isArray(parsed.actions) ? parsed.actions : [];
  const checks = checksFor(s.id, reply, actions);
  return {
    scenario_id: s.id,
    scenario_name: s.name,
    prompt: s.prompt,
    request_context: s.context,
    target_url: TARGET,
    expected_deploy_id: EXPECTED_DEPLOY_ID,
    expected_implementation_commit: EXPECTED_IMPLEMENTATION_COMMIT,
    http_status: status,
    ok: parsed ? parsed.ok : null,
    provider: parsed ? parsed.provider : null,
    mode: parsed ? parsed.mode : null,
    reply,
    actions,
    checks,
    checks_pass: Object.values(checks).every(Boolean),
    raw_response: parsed || text,
    harness_error: error
  };
}

(async () => {
  const evidence = [];
  for (const s of scenarios) {
    const result = await runScenario(s);
    evidence.push(result);
    console.log(`\n===== ${result.scenario_id} — ${result.scenario_name} =====`);
    console.log(JSON.stringify(result, null, 2));
  }
  fs.mkdirSync('validation-artifacts', { recursive: true });
  fs.writeFileSync('validation-artifacts/morgan-funding-final-runtime-v2.json', JSON.stringify({
    package: 'NEBC FINAL MORGAN FUNDING RUNTIME EVIDENCE V2',
    target_url: TARGET,
    expected_deploy_id: EXPECTED_DEPLOY_ID,
    expected_implementation_commit: EXPECTED_IMPLEMENTATION_COMMIT,
    evidence
  }, null, 2));
  const transportFailures = evidence.filter(x => x.http_status !== 200 || x.provider !== 'openai' || x.mode !== 'ai' || x.harness_error);
  const objectiveFailures = evidence.filter(x => !x.checks_pass);
  console.log(`\nSUMMARY scenarios=${evidence.length} transport_failures=${transportFailures.length} objective_failures=${objectiveFailures.length}`);
  if (transportFailures.length || objectiveFailures.length) process.exitCode = 2;
})();
