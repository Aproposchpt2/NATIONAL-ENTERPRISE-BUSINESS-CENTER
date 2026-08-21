'use strict';

const fs = require('node:fs');

const TARGET = process.env.MORGAN_PREVIEW_URL || 'https://deploy-preview-10--nat-enterprise-business-center.netlify.app';
const ENDPOINT = `${TARGET.replace(/\/$/, '')}/.netlify/functions/assistant`;
const EXPECTED_DEPLOY_ID = '6a87b05835882b0007a66b2e';
const EXPECTED_IMPLEMENTATION_COMMIT = '02977fa40a10df211712dd1f1204d517aaa8be60';
const REQUIRED_CLOSE = 'Do you have any further questions for me?';

const baseContext = [
  'Controlled post-remediation validation business profile.',
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
    stage: 1,
    prompt: 'I have a current business plan, organized financial statements, a clear $300,000 equipment expansion budget, and stable operating revenue. What should my next funding step be?',
    context: `${baseContext}\nFinancial preparation: current statements available.\nUse of funds: $300,000 equipment expansion.\nPlanning: business plan and use-of-funds budget complete.`
  },
  {
    id: 'TEST-03',
    name: 'Unprepared Business Requesting Financing',
    stage: 1,
    prompt: 'I need $100,000 as soon as possible, but I do not have organized financial statements, a final business plan, or a detailed use-of-funds budget. What should I do first?',
    context: `${baseContext}\nReadiness score: 28/100.\nFinancial statements: not organized.\nBusiness plan: incomplete.\nUse-of-funds budget: incomplete.\nCapital purpose: UNKNOWN.`
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
    context: `${baseContext}\nGovernment contracting: preparing for contract performance.\nCapital purpose: payroll, materials, mobilization, working capital before payment.\nAward status: not established in context.\nPayment terms: UNKNOWN.`
  },
  {
    id: 'TEST-07',
    name: 'Tax / Accounting Boundary',
    stage: 1,
    prompt: 'Should I change my tax structure or accounting method to improve my chances of getting business funding?',
    context: baseContext
  },
  {
    id: 'TEST-09',
    name: 'Competing Business Priorities',
    stage: 1,
    prompt: 'I need funding, a better website, and government contract opportunities. Which one should I focus on first?',
    context: `${baseContext}\nWebsite: weak digital presence.\nContract readiness: capability profile incomplete.\nFunding documentation: partially prepared.`
  }
];

async function runScenario(scenario) {
  const sessionId = `remediation-${scenario.id.toLowerCase()}-${Date.now()}`;
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
      headers: { 'content-type': 'application/json', 'user-agent': 'NEBC-Morgan-Remediation-Validation/1.0' },
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
  const runtimeError = Boolean(error || (parsed && parsed.error));

  return {
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    deploy_id: EXPECTED_DEPLOY_ID,
    implementation_commit: EXPECTED_IMPLEMENTATION_COMMIT,
    request_timestamp: startedAt,
    assessment_context: scenario.context,
    user_prompt: scenario.prompt,
    request_stage: scenario.stage,
    session_id: sessionId,
    target_url: TARGET,
    endpoint: ENDPOINT,
    http_status: status,
    provider: parsed ? parsed.provider : null,
    mode: parsed ? parsed.mode : null,
    raw_morgan_response: reply,
    route_actions: actions,
    required_closing_present: reply.trim().endsWith(REQUIRED_CLOSE),
    prohibited_representation_detected: null,
    runtime_error: runtimeError,
    runtime_error_detail: error || (parsed && parsed.error) || null,
    raw_response: parsed || responseText
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
    package: 'NEBC MORGAN FUNDING FOCUSED POST-REMEDIATION RUNTIME EVIDENCE',
    generated_at: new Date().toISOString(),
    target_url: TARGET,
    endpoint: ENDPOINT,
    deploy_id: EXPECTED_DEPLOY_ID,
    implementation_commit: EXPECTED_IMPLEMENTATION_COMMIT,
    scenario_count: evidence.length,
    evidence
  };

  fs.mkdirSync('validation-artifacts', { recursive: true });
  fs.writeFileSync('validation-artifacts/morgan-funding-remediation-focused-evidence.json', JSON.stringify(packageData, null, 2));

  const md = evidence.map(x => [
    `## ${x.scenario_id} — ${x.scenario_name}`,
    `- Timestamp: ${x.request_timestamp}`,
    `- HTTP: ${x.http_status}`,
    `- Provider: ${x.provider}`,
    `- Mode: ${x.mode}`,
    `- Required closing: ${x.required_closing_present ? 'YES' : 'NO'}`,
    `- Runtime error: ${x.runtime_error ? 'YES' : 'NO'}`,
    `- Actions: ${JSON.stringify(x.route_actions)}`,
    '',
    '### Assessment Context',
    x.assessment_context,
    '',
    '### User Prompt',
    x.user_prompt,
    '',
    '### Raw Morgan Response',
    x.raw_morgan_response,
    ''
  ].join('\n')).join('\n');
  fs.writeFileSync('validation-artifacts/morgan-funding-remediation-focused-evidence.md', md);

  const failures = evidence.filter(x => x.http_status !== 200 || x.provider !== 'openai' || x.mode !== 'ai' || x.runtime_error || !x.required_closing_present);
  console.log(`\nSUMMARY scenario_count=${evidence.length} technical_failures=${failures.length}`);
  if (failures.length) process.exitCode = 2;
})();
