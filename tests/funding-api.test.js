'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const apiPath = require.resolve('../netlify/functions/funding-match');
const enginePath = require.resolve('../netlify/functions/_funding-match');

function loadHandlerWithEngine(engine) {
  const original = require.cache[enginePath];
  require.cache[enginePath] = { id: enginePath, filename: enginePath, loaded: true, exports: engine };
  delete require.cache[apiPath];
  const handler = require(apiPath).handler;
  if (original) require.cache[enginePath] = original;
  else delete require.cache[enginePath];
  delete require.cache[apiPath];
  return handler;
}

const realEngine = require('../netlify/functions/_funding-match');
const validProfile = {
  businessName: 'Controlled Test Business',
  state: 'NV',
  amount: 50000,
  use: 'equipment',
  revenue: 250000,
  employees: 3,
  capital: 'open',
  timing: 'now'
};

test('funding API rejects wrong HTTP methods with 405', async () => {
  const handler = loadHandlerWithEngine(realEngine);
  const response = await handler({ httpMethod: 'GET', body: '' });
  assert.equal(response.statusCode, 405);
  assert.equal(JSON.parse(response.body).error, 'METHOD_NOT_ALLOWED');
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('funding API rejects invalid JSON with 400', async () => {
  const handler = loadHandlerWithEngine(realEngine);
  const response = await handler({ httpMethod: 'POST', body: '{bad json' });
  assert.equal(response.statusCode, 400);
  assert.equal(JSON.parse(response.body).error, 'INVALID_JSON');
});

test('funding API rejects invalid profile with validation details', async () => {
  const handler = loadHandlerWithEngine(realEngine);
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify({ state: 'NV', amount: 0, use: 'equipment', capital: 'debt' }) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 400);
  assert.equal(body.error, 'INVALID_PROFILE');
  assert.ok(body.details.some(detail => detail.includes('amount must be greater than zero')));
});

test('funding API fails closed with 503 when catalog integrity loading fails', async () => {
  const failingEngine = {
    validateProfile: realEngine.validateProfile,
    loadEmbeddedEnvelope() { throw new Error('CATALOG_PROJECTION_HASH_MISMATCH'); },
    rankMatches: realEngine.rankMatches
  };
  const handler = loadHandlerWithEngine(failingEngine);
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(validProfile) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error, 'FUNDING_CATALOG_CONTROL_FAILURE');
  assert.match(body.detail, /CATALOG_PROJECTION_HASH_MISMATCH/);
});

test('funding API returns bounded explainable controlled intelligence', async () => {
  const handler = loadHandlerWithEngine(realEngine);
  const response = await handler({ httpMethod: 'POST', body: JSON.stringify(validProfile) });
  const body = JSON.parse(response.body);
  assert.equal(response.statusCode, 200);
  assert.equal(body.ok, true);
  assert.deepEqual(body.programs, ['microloan', 'sbic']);
  assert.ok(body.matches.length > 0 && body.matches.length <= 25);
  assert.equal(body.returnedMatches, body.matches.length);
  assert.equal(body.catalog_record_count, 549);
  assert.equal(body.intelligence_version, 'ABFOP-NEBC-FUNDING-INTELLIGENCE-001');
  assert.match(body.disclaimer, /not eligibility findings, approvals/i);
  assert.ok(Array.isArray(body.matches[0].fit));
  assert.ok(Array.isArray(body.matches[0].gaps));
  assert.equal(typeof body.matches[0].nextAction, 'string');
  assert.equal(typeof body.matches[0].relevance, 'number');
});
