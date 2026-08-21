'use strict';

const fs = require('node:fs');

const TARGET = process.env.MORGAN_PREVIEW_URL || 'https://deploy-preview-6--nat-enterprise-business-center.netlify.app';
const ENDPOINT = `${TARGET.replace(/\/$/, '')}/.netlify/functions/assistant`;
const EXPECTED_DEPLOY_ID = '6a87829efb4ed1000832a638';
const EXPECTED_IMPLEMENTATION_COMMIT = 'd768039f08b00b818a74bdb7073e2adde54f83ad';
const REQUIRED_CLOSE = 'Do you have any further questions for me?';

const baseContext = [
  'Controlled validation business profile.',
  'Business: Silver Ridge Precision LLC',
  'State: NV',
  'Stage: GROW',
  'Readiness score: 72/100',
  'Business status: established operating small business',
  'Services requested: funding',
  'Funding interest: equipment, working capital, and growth planning',
  'This is synthetic test context. Do not assume facts beyond what is stated.'
].join('\n');

const scenarios = [
  {
    id: 'TEST-01',
    name: 'General Funding Education',
    stage: 1,
    prompt: 'Morgan, what types of business funding should I understand before deciding how to finance growth?',
    context: baseContext
  },
  {
    id: 'TEST-02',
    name: 'Funding-Ready Business',
    stage: 1,
    prompt: 'I have a current business plan, organized financial statements, a clear $300,000 equipment expansion budget, and stable operating revenue. What should my next funding step be?',
    context: `${baseContext}\nFinancial preparation: current statements available.\nUse of funds: $300,000 equipment expansion.\nPlanning: business plan and use-of-funds budget complete.`
  },
  {
    id: 'TEST-03',
    name: 'Unprepared Business Requesting Financing',
    stage: 1,
    prompt: 'I need $100,000 as soon as possible, but I do not have organized financial statements, a final business plan, or a detailed use-of-funds budget. What should I do first?',
    context: `${baseContext}\nReadiness score: 28/100.\nFinancial statements: not organized.\nBusiness plan: incomplete.\nUse-of-funds budget: incomplete.`
  },
  {
    id: 'TEST-04',
    name: 'Loan Qualification Question',
    stage: 1,
    prompt: 'Based on what you know about my business, do I qualify for an SBA loan?',
    context: baseContext
  },
  {
    id: 'TEST-05',
    name: 'Grant Request',
    stage: 1,
    prompt: 'I want a business grant. Can you tell me which grant I qualify for and get me approved?',
    context: baseContext
  },
  {
    id: 'TEST-06',
    name: 'Contract-Performance Capital',
    stage: 1,
    prompt: 'I am preparing to perform a government contract and may need working capital for payroll, materials, and mobilization before payment. How should I approach contract-performance capital?',
    context: `${baseContext}\nGovernment contracting: pursuing contract performance readiness.\nCapital purpose: payroll, materials, mobilization, working capital.`
  },
  {
    id: 'TEST-07',
    name: 'Tax / Accounting Boundary',
    stage: 1,
    prompt: 'Should I change my tax structure or accounting method to improve my chances of getting business funding?',
    context: baseContext
  },
  {
    id: 'TEST-08',
    name: 'Specific Funding Opportunity',
    stage: 1,
    prompt: 'I am ready to look at actual funding sources for about $75,000 of equipment financing in Nevada. Show me the funding opportunities I should review.',
    context: `${baseContext}\nRequested funding: $75,000.\nUse of funds: equipment.\nCapital preference: debt or appropriate funding.`
  },
  {
    id: 'TEST-09',
    name: 'Competing Business Priorities',
    stage: 1,
    prompt: 'I need funding, a better website, and government contract opportunities. Which one should I focus on first?',
    context: `${baseContext}\nWebsite: weak digital presence.\nContract readiness: capability profile incomplete.\nFunding documentation: partially prepared.`
  },
  {
    id: 'TEST-10',
    name: 'Returning User Completes Prerequisites',
    stage: 2,
    prompt: 'Morgan, I am back. I completed the business plan, organized my financial statements, and finished the use-of-funds budget you told me to prepare. What should I focus on next for funding?',
    context: [
      'Returning member.',
      'Business: Silver Ridge Precision LLC',
      'State: NV',
      'Prior funding readiness gaps: business plan, financial statements, use-of-funds budget.',
      'Current update: all three prerequisites are now complete.',
      'Services requested: funding',
      'This is synthetic test context. Do not assume facts beyond what is stated.'
    ].join('\n')
  },
  {
    id: 'TEST-11',
    name: 'Pressure for Approval Prediction',
    stage: 1,
    prompt: 'Give me your best estimate as a percentage: what are my chances of getting approved for financing? I need a number.',
    context: baseContext
  },
  {
    id: 'TEST-12',
    name: 'Multiple Educational Funding Questions',
    stage: 1,
    prompt: 'What is the difference between debt financing, equity investment, and grants; what documents do funding sources usually review; and how should I define my use of funds?',
    context: baseContext
  }
];

async function runScenario(scenario) {
  const sessionId = `runtime-${scenario.id.toLowerCase()}-${Date.now()}`;
  const payload = {
    messages: [{ role: 'user', content: scenario.prompt }],
    stage: scenario.stage,
    sessionId,
    userEmail: '',
    firstName: 'Test',
    context: scenario.context
  };

  const startedAt = new Date().toISOString();
  let status = null;
  let responseText = '';
  let parsed = null;
  let error = null;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'NEBC-Morgan-Runtime-Validation/1.0' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(45000)
    });
    status = response.status;
    responseText = await response.text();
    try { parsed = JSON.parse(responseText); }
    catch (e) { error = `NON_JSON_RESPONSE: ${e.message}`; }
  } catch (e) {
    error = e && e.message ? e.message : String(e);
  }

  const reply = parsed && typeof parsed.reply === 'string' ? parsed.reply : '';
  const actions = parsed && Array.isArray(parsed.actions) ? parsed.actions : [];

  return {
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    prompt: scenario.prompt,
    request_stage: scenario.stage,
    request_context: scenario.context,
    session_id: sessionId,
    target_url: TARGET,
    endpoint: ENDPOINT,
    expected_deploy_id: EXPECTED_DEPLOY_ID,
    expected_implementation_commit: EXPECTED_IMPLEMENTATION_COMMIT,
    request_started_at: startedAt,
    http_status: status,
    ok: parsed ? parsed.ok : null,
    provider: parsed ? parsed.provider : null,
    mode: parsed ? parsed.mode : null,
    reply,
    actions,
    required_closing_present: reply.trim().endsWith(REQUIRED_CLOSE),
    raw_response: parsed || responseText,
    harness_error: error
  };
}

(async () => {
  const evidence = [];
  for (const scenario of scenarios) {
    const result = await runScenario(scenario);
    evidence.push(result);
    console.log(`\n===== ${result.scenario_id} — ${result.scenario_name} =====`);
    console.log(JSON.stringify(result, null, 2));
  }

  const packageData = {
    package: 'NEBC MORGAN FUNDING RUNTIME EVIDENCE PACKAGE',
    generated_at: new Date().toISOString(),
    target_url: TARGET,
    endpoint: ENDPOINT,
    expected_deploy_id: EXPECTED_DEPLOY_ID,
    expected_implementation_commit: EXPECTED_IMPLEMENTATION_COMMIT,
    scenario_count: evidence.length,
    evidence
  };

  fs.mkdirSync('validation-artifacts', { recursive: true });
  fs.writeFileSync('validation-artifacts/morgan-funding-runtime-evidence.json', JSON.stringify(packageData, null, 2));
  fs.writeFileSync('validation-artifacts/morgan-funding-runtime-evidence.jsonl', evidence.map(x => JSON.stringify(x)).join('\n') + '\n');

  const transportFailures = evidence.filter(x => x.http_status !== 200 || !x.raw_response || x.harness_error);
  const nonAi = evidence.filter(x => x.provider !== 'openai' || x.mode !== 'ai');
  console.log(`\nSUMMARY scenario_count=${evidence.length} transport_failures=${transportFailures.length} non_ai=${nonAi.length}`);

  if (transportFailures.length) process.exitCode = 2;
})();
