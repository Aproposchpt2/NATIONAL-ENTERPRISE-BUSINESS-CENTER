'use strict';
// Basic fixed-window rate limiting for NEBC's unauthenticated public functions
// (website-generate.js, member-upload.js). Backed by the nebc_check_rate_limit()
// Postgres function (see migration nebc_rate_limits), so it holds across cold
// starts and concurrent invocations -- an in-memory counter would not.
//
// This is a stopgap, not per-member auth: it caps how fast any single caller can
// hit a given endpoint, it does not know who a "member" is. See the auth TODOs in
// website-generate.js / member-upload.js for the real fix.

function clientKey(event) {
  const h = event.headers || {};
  return (
    h['x-nf-client-connection-ip'] ||
    h['client-ip'] ||
    (h['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

// Returns true if the request is allowed, false if it should be rejected with 429.
// Fails OPEN (allows the request) if the rate-limit check itself errors, so a
// Supabase hiccup degrades to "no rate limiting" rather than taking the endpoint down.
async function checkRateLimit({ supabaseUrl, serviceKey, event, bucket, limit, windowSeconds }) {
  const key = clientKey(event);
  try {
    const r = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/nebc_check_rate_limit`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_bucket: bucket, p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
    });
    if (!r.ok) return true;
    const allowed = await r.json().catch(() => true);
    return allowed !== false;
  } catch (_) {
    return true;
  }
}

module.exports = { checkRateLimit };
