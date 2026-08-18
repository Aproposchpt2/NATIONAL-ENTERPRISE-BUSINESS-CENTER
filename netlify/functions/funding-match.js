'use strict';

const { validateProfile, validateSourceEnvelope, rankMatches } = require('./_funding-match');

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

  const sourceUrl = String(process.env.ABFOP_FUNDING_SOURCE_URL || '').trim();
  if (!sourceUrl) return json(503, { ok: false, error: 'FUNDING_SOURCE_NOT_CONFIGURED' });

  let url;
  try { url = new URL(sourceUrl); }
  catch { return json(503, { ok: false, error: 'FUNDING_SOURCE_URL_INVALID' }); }
  if (url.protocol !== 'https:') return json(503, { ok: false, error: 'FUNDING_SOURCE_URL_NOT_HTTPS' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    const headers = { Accept: 'application/json' };
    if (process.env.ABFOP_FUNDING_SOURCE_TOKEN) headers.Authorization = `Bearer ${process.env.ABFOP_FUNDING_SOURCE_TOKEN}`;
    response = await fetch(url, { headers, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    return json(502, { ok: false, error: error?.name === 'AbortError' ? 'FUNDING_SOURCE_TIMEOUT' : 'FUNDING_SOURCE_TRANSPORT_FAILURE' });
  }
  clearTimeout(timer);

  if (!response.ok) return json(502, { ok: false, error: 'FUNDING_SOURCE_HTTP_FAILURE', sourceStatus: response.status });

  let payload;
  try { payload = await response.json(); }
  catch { return json(502, { ok: false, error: 'FUNDING_SOURCE_INVALID_JSON' }); }

  let envelope;
  try { envelope = validateSourceEnvelope(payload); }
  catch (error) { return json(502, { ok: false, error: 'FUNDING_SOURCE_CONTRACT_FAILURE', detail: error.message }); }

  return json(200, { ok: true, profile: checked.profile, ...rankMatches(checked.profile, envelope) });
};
