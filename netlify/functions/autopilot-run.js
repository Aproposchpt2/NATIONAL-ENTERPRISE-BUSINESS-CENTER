// Apropos Social Autopilot — "the stable." One engine, many client pages.
// Hourly: for every ACTIVE client whose post_hour_utc == this hour and who
// hasn't posted yet today, generate an on-brand post and publish to THEIR page.
// Same proven engine that runs the in-house Message Horse, generalized per client.
//
// Scheduled publishing is automatic. Manual controls require AUTOPILOT_ADMIN_KEY:
//   ?admin_key=<key>&dry=1                 → preview due clients, publish nothing
//   ?admin_key=<key>&client=<uuid>&dry=1   → preview one client now
//   ?admin_key=<key>&all=1&dry=1           → preview all active clients

const FB_API = 'https://graph.facebook.com/v21.0';
const MODEL  = process.env.MESSAGE_MODEL || 'claude-sonnet-4-6';
const SUPA   = process.env.SUPABASE_URL;
const SKEY   = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CURRENT_PUBLIC_HOSTS = new Set([
  'marketplace.aproposgroupllc.com',
  'federalcontractorportal.aproposgroupllc.com',
  'natcorp.aproposgroupllc.com',
  'nebc.aproposgroupllc.com',
  'ai4businesses.org',
  'ai4websitedesign.com',
  'espanola.ai4websitedesign.com',
  'aproposgroupllc.com',
]);

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } });

function safeUrl(req) { try { return new URL(req.url); } catch (_) { return null; } }

function approvedPublicLink(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && CURRENT_PUBLIC_HOSTS.has(u.hostname.toLowerCase());
  } catch (_) { return false; }
}

async function invocationKind(req) {
  if (req.method !== 'POST') return 'manual';
  try {
    const body = await req.clone().json();
    if (body && typeof body.next_run === 'string') return 'scheduled';
  } catch (_) {}
  return 'manual';
}

// ---- Supabase REST (Node-18 safe; no supabase-js / no WebSocket) ----
async function supa(path, opts = {}) {
  const r = await fetch(`${SUPA}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SKEY, Authorization: `Bearer ${SKEY}`,
      'Content-Type': 'application/json', ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  return data;
}

// ---- Theme selection (per client) ----
function pickTheme(client) {
  const themes = Array.isArray(client.themes) && client.themes.length ? client.themes : null;
  if (!themes) {
    return {
      key: 'value',
      url: client.default_link || '',
      brief: client.about || `${client.business_name} — what we do and why it helps you.`,
    };
  }
  const dayIndex = Math.floor(Date.now() / 86400000); // rotate by day
  const t = themes[dayIndex % themes.length] || themes[0];
  const links = client.links || {};
  return {
    key: t.key || 'value',
    url: t.url || links[t.key] || client.default_link || '',
    brief: t.brief || client.about || client.business_name,
  };
}

// ---- AI generation (keyless fallback keeps it from ever breaking) ----
async function generateMessage(client, theme) {
  const link = theme.url || client.default_link || '';
  if (!approvedPublicLink(link)) throw new Error(`Blocked non-current public destination: ${link || '(empty)'}`);
  const tail = link ? `\n\nLearn more: ${link}` : '';
  if (!process.env.ANTHROPIC_API_KEY) return `${theme.brief}${tail}`.trim();

  const prompt = `You write today's Facebook post for "${client.business_name}".
About the business: ${client.about || client.business_name}
${client.tone ? 'Voice: ' + client.tone : 'Voice: confident, plain-spoken, and real — never corporate-stiff, never spammy.'}
Today's angle: ${theme.brief}

Write ONE Facebook post:
- A strong first-line hook that stops the scroll.
- 1-3 short paragraphs of real value (what it does FOR the reader, not buzzwords).
- Use only the current service described in Today's angle. Do not mention retired APROPOS brands or old domains.
- A clear call to action ending with the link ${link}
- At most 1-2 relevant hashtags (or none). One or two emoji max, only if natural.
- Output ONLY the post text, ready to publish. No preamble, no surrounding quotes.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI generation failed');
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  return text || `${theme.brief}${tail}`.trim();
}

// ---- Facebook publishing (resolves a real page token; New Pages safe) ----
async function resolvePageContext(token, pageId) {
  try {
    const r = await fetch(`${FB_API}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && d.access_token) return { id: pageId, token: d.access_token };
  } catch (_) {}
  try {
    const r = await fetch(`${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && Array.isArray(d.data)) {
      const match = d.data.find(p => p.id === pageId) || d.data[0];
      if (match && match.access_token) return { id: match.id, token: match.access_token };
    }
  } catch (_) {}
  return { id: pageId, token };
}

async function postToFacebook(message, pageId, token) {
  if (!token) return { posted: false, error: 'no page token on client' };
  try {
    const ctx = await resolvePageContext(token, pageId);
    const r = await fetch(`${FB_API}/${ctx.id}/feed`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: ctx.token }),
    });
    const d = await r.json();
    if (!r.ok) return { posted: false, error: d?.error?.message || ('HTTP ' + r.status) };
    return { posted: true, id: d.id };
  } catch (e) { return { posted: false, error: String(e.message || e) }; }
}

async function emailClient(client, message, fb) {
  const key = process.env.RESEND_API_KEY, from = process.env.RESEND_FROM_EMAIL;
  const to = client.owner_email || process.env.MESSAGE_RECIPIENT;
  if (!key || !from || !to) return { emailed: false, reason: 'Resend env or owner_email missing' };
  const status = fb && fb.posted ? 'Already published to your Page.' : 'Copy/paste this to your Page.';
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#c79a3e;font-weight:700;margin-bottom:8px">Apropos Social Autopilot · ${client.business_name}</div>
    <div style="font-size:13px;color:#3c5249;margin-bottom:16px">${status}</div>
    <div style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:15px;line-height:1.6">${String(message).replace(/&/g,'&amp;').replace(/</g,'&lt;')}</div>
  </div>`;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `Today's post — ${client.business_name}`, html }),
    });
    return { emailed: r.ok };
  } catch (e) { return { emailed: false, error: String(e.message || e) }; }
}

export const config = { schedule: '0 * * * *' }; // hourly; each client posts on its own hour

export default async (req) => {
  if (!SUPA || !SKEY) return json({ error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set' }, 500);

  const url = safeUrl(req);
  const invocation = await invocationKind(req);
  if (invocation === 'manual') {
    if (!process.env.AUTOPILOT_ADMIN_KEY) return json({ error: 'AUTOPILOT_ADMIN_KEY not set on site' }, 500);
    if (url?.searchParams.get('admin_key') !== process.env.AUTOPILOT_ADMIN_KEY) return json({ error: 'unauthorized' }, 401);
  }

  const dry       = url?.searchParams.get('dry') === '1';
  const oneClient = url?.searchParams.get('client') || null;
  const all       = url?.searchParams.get('all') === '1';
  const nowHour   = new Date().getUTCHours();
  const today     = new Date().toISOString().slice(0, 10);

  let query = 'social_autopilot_clients?status=eq.active&select=*';
  if (oneClient) query = `social_autopilot_clients?id=eq.${encodeURIComponent(oneClient)}&select=*`;

  let clients;
  try { clients = await supa(query); }
  catch (e) { return json({ error: String(e.message || e) }, 500); }
  clients = Array.isArray(clients) ? clients : [];

  const due = clients.filter(c => {
    if (oneClient || all) return true;                                   // authorized explicit run / preview-all
    if ((c.mode || 'post') === 'paused' || c.status !== 'active') return false;
    if (c.post_hour_utc !== nowHour) return false;                       // not this client's hour
    if (c.last_run_at && String(c.last_run_at).slice(0, 10) === today) return false; // already today
    return true;
  });

  const results = [];
  for (const c of due) {
    const theme = pickTheme(c);
    const destination = theme.url || c.default_link || '';
    const mode = dry ? 'preview' : (c.mode || 'post');
    const res = { client: c.business_name, id: c.id, theme: theme.key, link: destination, mode };

    if (!approvedPublicLink(destination)) {
      res.error = `Blocked non-current public destination: ${destination || '(empty)'}`;
      results.push(res);
      continue;
    }

    let message;
    try { message = await generateMessage(c, theme); }
    catch (e) {
      res.error = String(e.message || e);
      results.push(res);
      continue;
    }

    if (!dry && (mode === 'post' || mode === 'both')) res.facebook = await postToFacebook(message, c.page_id, c.page_token);
    if (!dry && (mode === 'email' || mode === 'both')) res.email = await emailClient(c, message, res.facebook);

    if (!dry) {
      const patch = res.facebook && res.facebook.posted
        ? { last_run_at: new Date().toISOString(), last_post_id: res.facebook.id, last_error: null, updated_at: new Date().toISOString() }
        : { last_run_at: new Date().toISOString(), last_error: (res.facebook && res.facebook.error) || null, updated_at: new Date().toISOString() };
      try { await supa(`social_autopilot_clients?id=eq.${c.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(patch) }); } catch (_) {}
    }

    res.message = message;
    results.push(res);
  }

  return json({ ran: new Date().toISOString(), hour_utc: nowHour, invocation, dry, considered: clients.length, posted: results.length, results });
};
