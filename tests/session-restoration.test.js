'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function jsonResponse(data, ok = true, status = ok ? 200 : 500) {
  return { ok, status, async json() { return data; }, async text() { return JSON.stringify(data); } };
}

function loadOtpHandler() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role';
  delete require.cache[require.resolve('../netlify/functions/member-otp-verify')];
  return require('../netlify/functions/member-otp-verify').handler;
}

function memberRow(code = '123456') {
  return {
    full_name: 'Alex Member', business_name: 'Member Co', state: 'NV', business_stage: 'GROW', readiness_score: 72,
    business_status: ['registered'], services_needed: ['funding'], agent_context: 'Saved member context',
    subscription_status: 'active', trial_end: null, login_code: code,
    login_code_expires: new Date(Date.now() + 60000).toISOString(),
  };
}

async function verifyWithMocks({ email = 'alex@example.com', code = '123456', sessionRows = [], member = memberRow(), sessionFailure = false } = {}) {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/rest/v1/biz_center_members') && (!opts.method || opts.method === 'GET')) return jsonResponse([member]);
    if (String(url).includes('/rest/v1/biz_center_members') && opts.method === 'PATCH') return jsonResponse([]);
    if (String(url).includes('/rest/v1/morgan_sessions')) return sessionFailure ? jsonResponse({ error: 'down' }, false, 503) : jsonResponse(sessionRows);
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const handler = loadOtpHandler();
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify({ email, code }) });
    return { res, body: JSON.parse(res.body), calls };
  } finally { global.fetch = oldFetch; }
}

const savedMessages = [
  { role: 'user', content: 'What should I do next?' },
  { role: 'assistant', content: 'Review your priority.\n\nDo you have any further questions for me?' },
];

test('SR-01 authenticated member restores prior Morgan session', async () => {
  const { body, calls } = await verifyWithMocks({ sessionRows: [{ id: 'sess-1', stage: '1', messages: savedMessages, updated_at: '2026-08-24T20:00:00Z' }] });
  assert.equal(body.ok, true);
  assert.equal(body.member.morganRestoration.status, 'restored');
  assert.equal(body.member.morganRestoration.session.sessionId, 'sess-1');
  assert.deepEqual(body.member.morganRestoration.session.messages, savedMessages);
  const sessionCall = calls.find(c => c.url.includes('/morgan_sessions'));
  assert.match(sessionCall.url, /user_email=eq\.alex%40example\.com/);
});

test('SR-02 empty browser storage is not required for authenticated restoration', async () => {
  const { body } = await verifyWithMocks({ sessionRows: [{ id: 'server-session', stage: '2', messages: savedMessages, updated_at: '2026-08-24T20:00:00Z' }] });
  assert.equal(body.member.morganRestoration.session.sessionId, 'server-session');
  const coach = fs.readFileSync(path.join(ROOT, 'coach.html'), 'utf8');
  assert.match(coach, /restoration\.session\.sessionId/);
  assert.match(coach, /convo=restoration\.session\.messages\.slice\(\)/);
});

test('SR-03 independent client authentication restores the same server session', async () => {
  const rows = [{ id: 'cross-device', stage: '1', messages: savedMessages, updated_at: '2026-08-24T20:00:00Z' }];
  const a = await verifyWithMocks({ sessionRows: rows });
  const b = await verifyWithMocks({ sessionRows: rows });
  assert.equal(a.body.member.morganRestoration.session.sessionId, 'cross-device');
  assert.equal(b.body.member.morganRestoration.session.sessionId, 'cross-device');
});

test('SR-04 unauthenticated or invalid OTP cannot retrieve Morgan sessions', async () => {
  const { res, calls } = await verifyWithMocks({ code: '000000', member: memberRow('123456'), sessionRows: [{ id: 'secret', messages: savedMessages }] });
  assert.equal(res.statusCode, 401);
  assert.equal(calls.some(c => c.url.includes('/morgan_sessions')), false);
});

test('SR-05 member A cannot retrieve Member B session', async () => {
  const calls = [];
  const oldFetch = global.fetch;
  global.fetch = async (url, opts = {}) => {
    calls.push(String(url));
    if (String(url).includes('/biz_center_members') && (!opts.method || opts.method === 'GET')) return jsonResponse([memberRow()]);
    if (String(url).includes('/biz_center_members') && opts.method === 'PATCH') return jsonResponse([]);
    if (String(url).includes('/morgan_sessions')) {
      assert.match(String(url), /user_email=eq\.memberb%40example\.com/);
      assert.doesNotMatch(String(url), /membera%40example\.com/);
      return jsonResponse([]);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  };
  try {
    const handler = loadOtpHandler();
    const res = await handler({ httpMethod: 'POST', body: JSON.stringify({ email: 'memberb@example.com', code: '123456' }) });
    const body = JSON.parse(res.body);
    assert.equal(body.member.morganRestoration.status, 'none');
  } finally { global.fetch = oldFetch; }
});

test('SR-06 newest valid recoverable session selection is deterministic', async () => {
  const rows = [
    { id: 'newest-invalid', stage: '2', messages: [], updated_at: '2026-08-24T21:00:00Z' },
    { id: 'newest-valid', stage: '1', messages: savedMessages, updated_at: '2026-08-24T20:00:00Z' },
    { id: 'older-valid', stage: '2', messages: savedMessages, updated_at: '2026-08-23T20:00:00Z' },
  ];
  const { body, calls } = await verifyWithMocks({ sessionRows: rows });
  assert.equal(body.member.morganRestoration.session.sessionId, 'newest-valid');
  const url = calls.find(c => c.url.includes('/morgan_sessions')).url;
  assert.match(url, /order=updated_at\.desc/);
  assert.match(url, /limit=10/);
});

test('SR-07 restored messages replace the active conversation instead of concatenating duplicates', () => {
  for (const file of ['coach.html', 'morgans-office.html']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(src, /convo=restoration\.session\.messages\.slice\(\)/);
    assert.doesNotMatch(src, /convo\.push\(\.\.\.restoration\.session\.messages/);
  }
});

test('SR-08 new post-restore messages persist to the restored session id', () => {
  for (const file of ['coach.html', 'morgans-office.html']) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.match(src, /morganSessionId=restoration\.session\.sessionId/);
    assert.match(src, /sessionId:morganSessionId/);
    assert.match(src, /MorganSession\.cache\(authenticatedMember,morganSessionId,convo\)/);
  }
  const assistant = fs.readFileSync(path.join(ROOT, 'netlify/functions/assistant.js'), 'utf8');
  assert.match(assistant, /saveMorganSession\(\{ sessionId: body\.sessionId, userEmail: body\.userEmail/);
});

test('SR-09 authenticated member with no prior session gets clean new-session state', async () => {
  const { body } = await verifyWithMocks({ sessionRows: [] });
  assert.equal(body.member.morganRestoration.status, 'none');
  assert.equal(body.member.morganRestoration.session, null);
});

test('restoration query failure is fail-safe and does not manufacture or erase history', async () => {
  const { body } = await verifyWithMocks({ sessionFailure: true });
  assert.equal(body.member.morganRestoration.status, 'unavailable');
  assert.equal(body.member.morganRestoration.session, null);
  const coach = fs.readFileSync(path.join(ROOT, 'coach.html'), 'utf8');
  assert.match(coach, /No saved history was changed/);
  assert.match(coach, /lockForRestoreFailure\(\)/);
});

test('SR-10 Funding regression protections remain present', () => {
  const assistant = fs.readFileSync(path.join(ROOT, 'netlify/functions/assistant.js'), 'utf8');
  assert.match(assistant, /FUNDING READY FOR FURTHER EVALUATION/);
  assert.match(assistant, /FUNDING PREPARATION REQUIRED/);
  assert.match(assistant, /EARLY-STAGE FUNDING DEVELOPMENT/);
  assert.match(assistant, /SPECIALIST REVIEW REQUIRED/);
  assert.match(assistant, /Do not search the controlled funding catalog conversationally/);
  assert.match(assistant, /Do you have any further questions for me\?/);
});
