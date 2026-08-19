'use strict';

const { validateProfile, loadEmbeddedEnvelope, rankMatches } = require('./_funding-match');

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

exports.handler = async function handler(event) {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED' });

  let input;
  try { input = JSON.parse(event.body || '{}'); }
  catch { return json(400, { ok: false, error: 'INVALID_JSON' }); }

  const checked = validateProfile(input);
  if (!checked.ok) return json(400, { ok: false, error: 'INVALID_PROFILE', details: checked.errors });

  let envelope;
  try { envelope = loadEmbeddedEnvelope(); }
  catch (error) {
    return json(503, { ok: false, error: 'FUNDING_CATALOG_CONTROL_FAILURE', detail: error.message });
  }

  return json(200, { ok: true, profile: checked.profile, ...rankMatches(checked.profile, envelope) });
};
