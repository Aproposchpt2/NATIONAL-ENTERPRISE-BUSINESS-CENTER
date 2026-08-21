'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://deploy-preview-6--nat-enterprise-business-center.netlify.app';
const endpoint = `${BASE}/.netlify/functions/assistant`;
const expectedClosing = 'Do you have any further questions for me?';

(async () => {
  const payload = {
    messages: [{ role: 'user', content: 'Morgan, briefly explain what I should evaluate before choosing debt financing or equity investment for business growth.' }],
    stage: 1,
    sessionId: `connectivity-precheck-${Date.now()}`,
    userEmail: '',
    firstName: 'Founder',
    context: 'Controlled connectivity precheck. Business: Silver Ridge Precision LLC. State: NV. Stage: GROW. Services requested: funding. This is synthetic validation context. Do not assume facts beyond what is stated.'
  };

  const result = {
    target_url: BASE,
    endpoint,
    expected_implementation_commit: 'd768039f08b00b818a74bdb7073e2adde54f83ad',
    request_started_at: new Date().toISOString(),
    prompt: payload.messages[0].content,
    http_status: null,
    provider: null,
    mode: null,
    reply: null,
    actions: [],
    required_closing_present: false,
    runtime_error: null,
    raw_response: null
  };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    result.http_status = response.status;
    result.provider = data.provider || null;
    result.mode = data.mode || null;
    result.reply = data.reply || null;
    result.actions = Array.isArray(data.actions) ? data.actions : [];
    result.required_closing_present = typeof data.reply === 'string' && data.reply.trim().endsWith(expectedClosing);
    result.runtime_error = data.error || null;
    result.raw_response = data;
  } catch (error) {
    result.runtime_error = error && error.message ? error.message : String(error);
  }

  fs.mkdirSync(path.join(process.cwd(), 'validation-artifacts'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'validation-artifacts', 'morgan-connectivity-precheck.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));

  const passed = result.http_status === 200 && result.provider === 'openai' && result.mode === 'ai' && !result.runtime_error && result.required_closing_present && typeof result.reply === 'string' && result.reply.length > 80;
  console.log(`MORGAN_CONNECTIVITY_PRECHECK=${passed ? 'PASS' : 'FAIL'}`);
  if (!passed) process.exitCode = 1;
})();
