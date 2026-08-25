'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://deploy-preview-39--nat-enterprise-business-center.netlify.app';
const endpoint = p => `${BASE}/.netlify/functions/${p}`;
const users = {
  ab: { email: 'nebc.sr.ab.p39.20260825@example.invalid', codeTag: 'AB', sessionId: '20000000-0000-4000-8000-000000000001' },
  c:  { email: 'nebc.sr.c.p39.20260825@example.invalid',  codeTag: 'C',  sessionId: '20000000-0000-4000-8000-000000000002' },
  da: { email: 'nebc.sr.da.p39.20260825@example.invalid', codeTag: 'DA', sessionId: '20000000-0000-4000-8000-000000000003' },
  db: { email: 'nebc.sr.db.p39.20260825@example.invalid', codeTag: 'DB', sessionId: '20000000-0000-4000-8000-000000000004' },
  e:  { email: 'nebc.sr.e.p39.20260825@example.invalid',  codeTag: 'E',  sessionId: '20000000-0000-4000-8000-000000000005' },
  f:  { email: 'nebc.sr.f.p39.20260825@example.invalid',  codeTag: 'F',  sessionId: '20000000-0000-4000-8000-000000000006' },
};

async function post(fn, body) {
  const r = await fetch(endpoint(fn), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = { raw: text }; }
  return { status: r.status, data };
}

async function createMember(u, label) {
  return post('generate-plan', {
    fullName: `SR ${label} Tester`, email: u.email, phone: '', businessName: `SR ${label} Test Co`, industry: 'Professional Services',
    city: 'Las Vegas', state: 'NV', businessStage: 'grow', businessStatus: ['registered'], servicesNeeded: ['funding'],
    otherNeeds: 'Synthetic authenticated Morgan session restoration validation.', targetCustomer: 'Small businesses'
  });
}

async function persistSession(u, marker) {
  return post('assistant', {
    messages: [{ role: 'user', content: `Please remember this synthetic validation marker: ${marker}. What should I focus on next?` }],
    stage: 1, sessionId: u.sessionId, userEmail: u.email, firstName: 'SR',
    context: `Synthetic session restoration validation. Business: Test Co. State: NV. Validation marker: ${marker}. Do not assume facts beyond what is stated.`
  });
}

async function requestOtp(u) { return post('member-otp-request', { email: u.email }); }

(async () => {
  const evidence = { target: BASE, startedAt: new Date().toISOString(), implementationCommit: 'bd3a09e2676d3fe628c4e11e9f9971195b19ecf4', results: {} };
  let failed = false;

  for (const [key, u] of Object.entries(users)) {
    const created = await createMember(u, key.toUpperCase());
    evidence.results[`create_${key}`] = { status: created.status, ok: created.data && created.data.ok === true };
    if (created.status !== 200 || !created.data || created.data.ok !== true) failed = true;
  }

  for (const key of ['ab', 'c', 'da', 'e']) {
    const u = users[key];
    const persisted = await persistSession(u, `SR-${key.toUpperCase()}-ORIGINAL`);
    evidence.results[`persist_${key}`] = { status: persisted.status, provider: persisted.data && persisted.data.provider, mode: persisted.data && persisted.data.mode, closing: !!(persisted.data && typeof persisted.data.reply === 'string' && persisted.data.reply.trim().endsWith('Do you have any further questions for me?')) };
    if (persisted.status !== 200 || !persisted.data || persisted.data.mode !== 'ai') failed = true;
  }

  for (const key of ['ab', 'c', 'db', 'e', 'f']) {
    const otp = await requestOtp(users[key]);
    evidence.results[`otp_${key}`] = { status: otp.status, ok: otp.data && otp.data.ok === true };
    if (otp.status !== 200 || !otp.data || otp.data.ok !== true) failed = true;
  }

  fs.mkdirSync(path.join(process.cwd(), 'validation-artifacts'), { recursive: true });
  fs.writeFileSync(path.join(process.cwd(), 'validation-artifacts', 'session-restoration-phase1.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
  if (failed) process.exitCode = 1;
})();
