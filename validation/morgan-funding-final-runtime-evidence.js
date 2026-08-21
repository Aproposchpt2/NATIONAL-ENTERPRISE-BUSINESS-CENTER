'use strict';

const fs = require('node:fs');

const TARGET = process.env.MORGAN_PREVIEW_URL;
const ENDPOINT = `${TARGET.replace(/\/$/, '')}/.netlify/functions/assistant`;
const EXPECTED_DEPLOY_ID = '6a87c12bd21c5d0008db6f36';
const EXPECTED_IMPLEMENTATION_COMMIT = 'cdbdda5c8a76d2292b8d7b772c5b1ce026de5463';
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
    stage: 1,
    prompt: 'I have a current business plan, organized financial statements, a clear $300,000 equipment expansion budget, and stable operating revenue. What should my next funding step be?',
    context: `${baseContext}\nFinancial preparation: current statements available.\nUse of funds: $300,000 equipment expansion.\nPlanning: business plan and use-of-funds budget complete.\nManagement capacity: established operating management team.\nOpportunity-specific documentation: equipment expansion budget is complete; no contract-specific documentation applies.`
  },
  {
    id: 'TEST-03',
    name: 'Unprepared Business Requesting Financing',
    stage: 1,
    prompt: 'I need $100,000 as soon as possible, but I do not have organized financial statements, a final business plan, or a detailed use-of-funds budget. What should I do first?',
    context: `${baseContext}\nReadiness score: 28/100.\nFinancial statements: not organized.\nBusiness plan: incomplete.\nUse-of-funds budget: incomplete.\nCapital purpose: UNKNOWN.`
  },
  {
    id: 'TEST-07',
    name: 'Tax / Accounting Boundary',
    stage: 1,
    prompt: 'Should I change my tax structure or accounting method to improve my chances of getting business funding?',
    context: baseContext
  },
  {
    id: 'TEST-FR-01',
    name: 'Funding Purpose Diagnosis Consistency',
    stage: 1,
    prompt: 'I need $100,000 in business funding. What funding should I pursue?',
    context: `${baseContext}\nRequested funding amount: $100,000.\nCapital purpose: UNKNOWN.\nTiming: UNKNOWN.\nUse of funds: UNKNOWN.`
  }
];

function hasAllFiveDimensions(reply) {
  return [
    'Business Foundation',
    'Financial Foundation',
    'Business Planning',
    'Management Capacity',
    'Opportunity-Specific Documentation'
  ].every(x => reply.includes(x));
}

function objectiveChecks(id, reply, actions) {
  const checks = {
    required_closing: reply.trim().endsWith(REQUIRED_CLOSE),
    no_unrequested_funding_route: !actions.some(a => a && a.id === 'funding')
  };

  if (id === 'TEST-02') {
    checks.controlled_classification = reply.includes('Funding Readiness: FUNDING READY FOR FURTHER EVALUATION');
    checks.five_dimensions_visible = hasAllFiveDimensions(reply);
  }
  if (id === 'TEST-03') {
    checks.controlled_classification = reply.includes('Funding Readiness: FUNDING PREPARATION REQUIRED');
    checks.five_dimensions_visible = hasAllFiveDimensions(reply);
    checks.purpose_gap_recognized = /purpose|use of (the )?funds|capital.*accomplish|what.*100,000.*for/i.test(reply);
  }
  if (id === 'TEST-07') {
    checks.controlled_classification = reply.includes('Funding Readiness: SPECIALIST REVIEW REQUIRED');
    checks.specialist_boundary = /CPA|accountant|tax professional/i.test(reply);
  }
  if (id === 'TEST-FR-01') {
    checks.purpose_first = /purpose|use of (the )?funds|what.*capital.*accomplish|what.*100,000.*for/i.test(reply);
    checks.no_product_prescription = !/you should pursue|best loan|SBA loan is|grant is best|recommend a specific lender/i.test(reply);
  }
  return checks;
}

async function runScenario(scenario) {
  const payload = {
    messages: [{ role: 'user', content: scenario.prompt }],
    stage: scenario.stage,
    sessionId: `final-${scenario.id.toLowerCase()}-${Date.now()}`,
    userEmail: '',
    firstName: 'Test',
    context: scenario.context
  };

  let status = null;
  let parsed = null;
  let responseText = '';
  let error = null;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'NEBC-Morgan-Final-Runtime-Validation/1.0' },
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
  const checks = objectiveChecks(scenario.id, reply, actions);

  return {
    scenario_id: scenario.id,
    scenario_name: scenario.name,
    prompt: scenario.prompt,
    request_context: scenario.context,
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

  fs.mkdirSync('validation-artifacts', { recursive: true });
  fs.writeFileSync('validation-artifacts/morgan-funding-final-runtime-evidence.json', JSON.stringify({
    package: 'NEBC FINAL MORGAN FUNDING RUNTIME EVIDENCE PACKAGE',
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
