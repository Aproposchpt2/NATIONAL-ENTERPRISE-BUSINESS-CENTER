'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const FIXTURE = 'https://deploy-preview-40--nat-enterprise-business-center.netlify.app/.netlify/functions/session-restoration-test-fixture';

async function diagnose() {
  const r = await fetch(FIXTURE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operation: 'diagnose' }),
  });
  const text = await r.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) { data = { error: 'non-json diagnostic response' }; }
  return { status: r.status, data };
}

(async () => {
  const result = { startedAt: new Date().toISOString() };
  try {
    const diag = await diagnose();
    const credential = diag.data?.credential || {};
    const probes = Array.isArray(diag.data?.probes) ? diag.data.probes : [];
    const biz = probes.find(p => p.table === 'biz_center_members') || {};
    const sessions = probes.find(p => p.table === 'morgan_sessions') || {};

    result.httpStatus = diag.status;
    result.urlParse = diag.data?.urlParse === true;
    result.targetProjectRef = diag.data?.targetProjectRef || null;
    result.variablePresent = credential.variablePresent === true;
    result.variableEmpty = credential.variableEmpty === true;
    result.maskedOrPlaceholder = credential.maskedOrPlaceholder === true;
    result.availableToServerFunction = credential.availableToServerFunction === true;
    result.recognizableCredentialFormat = credential.recognizableCredentialFormat === true;
    result.jwtServiceRoleClaim = credential.jwtServiceRoleClaim;
    result.jwtProjectRefMatchesTarget = credential.jwtProjectRefMatchesTarget;
    result.jwtExpired = credential.jwtExpired;
    result.bizCenterMembersStatus = biz.status ?? null;
    result.bizCenterMembersAuthorized = biz.authorized === true;
    result.morganSessionsStatus = sessions.status ?? null;
    result.morganSessionsAuthorized = sessions.authorized === true;

    result.pass = result.httpStatus === 200 && result.urlParse && result.variablePresent && !result.variableEmpty && !result.maskedOrPlaceholder && result.availableToServerFunction && result.bizCenterMembersAuthorized && result.morganSessionsAuthorized;

    fs.mkdirSync(path.join(process.cwd(), 'validation-artifacts'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'validation-artifacts', 'session-restoration-credential-gate.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));

    if (!result.pass) process.exit(2);

    const child = spawnSync(process.execPath, ['validation/session-restoration-runtime-final.js'], { stdio: 'inherit' });
    process.exit(child.status ?? 1);
  } catch (e) {
    result.pass = false;
    result.error = e && e.message ? e.message : String(e);
    fs.mkdirSync(path.join(process.cwd(), 'validation-artifacts'), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), 'validation-artifacts', 'session-restoration-credential-gate.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
    process.exit(2);
  }
})();
