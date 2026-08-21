// Apropos Message Horse — daily content distribution for the current APROPOS site suite.
// Generates one on-brand Facebook post, can publish it to the Facebook Page,
// and/or email the owner a review copy.
//
// MESSAGE_HORSE_MODE values:
//   paused  -> generate nothing / deliver nothing
//   email   -> email review copy only
//   post    -> publish to Facebook only
//   both    -> publish to Facebook + email a record/review copy
//
// Scheduled daily at 15:00 UTC (~8am Pacific during daylight time).

const FB_API = 'https://graph.facebook.com/v21.0';
const DEFAULT_PAGE_ID = '61573363201770';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

const THEMES = [
  {
    key: 'corporate-ai-procurement',
    name: 'Apropos Group LLC',
    url: 'https://aproposgroupllc.com/ai-procurement-modernization',
    brief: 'Explain how Apropos Group LLC approaches AI procurement modernization, acquisition workflow automation, procurement intelligence, document processing, supplier intelligence, and governed decision support while keeping accountable human review in the loop.'
  },
  {
    key: 'marketplace-contract-intelligence',
    name: 'APROPOS Marketing Marketplace',
    url: 'https://marketplace.aproposgroupllc.com/government-contract-intelligence/',
    brief: 'Help businesses understand government contract intelligence and how the APROPOS Marketing Marketplace routes them to the right federal, state, local, or business-readiness pathway without pretending the Marketplace itself is the operational contract database.'
  },
  {
    key: 'federal-contractors',
    name: 'Registered Federal Contractors Portal',
    url: 'https://federalcontractorportal.aproposgroupllc.com/guides/',
    brief: 'Educate registered and aspiring federal contractors about finding and evaluating federal opportunities, SAM.gov readiness, NAICS alignment, bid/no-bid decisions, capability statements, and solicitation review. Do not imply government affiliation or guarantee awards.'
  },
  {
    key: 'state-local-sled',
    name: 'National Corporate Contract Exchange',
    url: 'https://natcorp.aproposgroupllc.com/guides/',
    brief: 'Educate businesses about state, local, and education (SLED) contracting, vendor registration, procurement portals, cooperative purchasing, and opportunity discovery. Keep the distinction from federal contracting clear.'
  },
  {
    key: 'nevada-business-readiness',
    name: 'Nevada Enterprise Business Center',
    url: 'https://nebc.aproposgroupllc.com/guides/',
    brief: 'Explain business readiness, funding readiness, business planning, and structured self-assessment for Nevada businesses. Position NEBC as complementary to public Nevada business resources and never promise financing, grants, or approval.'
  }
];

function env(name, fallback = '') {
  const value = Netlify.env.get(name);
  return value == null || value === '' ? fallback : value;
}

function pickTheme() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return THEMES[dayIndex % THEMES.length];
}

async function generateMessage(theme) {
  const apiKey = env('ANTHROPIC_API_KEY');
  const model = env('MESSAGE_MODEL', DEFAULT_MODEL);
  if (!apiKey) return `${theme.brief}\n\nLearn more: ${theme.url}`;

  const prompt = `You write the daily Facebook post for Apropos Group LLC and its current digital properties.\n\nToday's featured property: ${theme.name}\nCanonical link: ${theme.url}\nToday's angle: ${theme.brief}\n\nVoice: confident, useful, plain-spoken, professional, and specific. Never spammy.\n\nWrite ONE Facebook post:\n- Start with a strong first-line hook.\n- Use 1–3 short paragraphs that teach something useful.\n- Describe the featured property accurately and do not invent capabilities.\n- Include a clear call to action ending with the exact canonical link ${theme.url}\n- Use at most 1–2 relevant hashtags, or none.\n- Do not claim government affiliation, guaranteed awards, guaranteed funding, guaranteed eligibility, or guaranteed results.\n- Do not mention retired APROPOS properties or old brand names.\n- Output ONLY the ready-to-publish post text.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'user', content: prompt }] })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || `AI generation failed (${response.status})`);
  const text = (data.content || []).map((item) => item.text || '').join('').trim();
  return text || `${theme.brief}\n\nLearn more: ${theme.url}`;
}

async function resolvePageContext(token, pageId) {
  const diag = {};
  try {
    const response = await fetch(`${FB_API}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(token)}`);
    const data = await response.json();
    diag.direct = response.ok ? (data.access_token ? 'got-token' : 'no-token') : (data?.error?.message || `HTTP ${response.status}`);
    if (response.ok && data.access_token) return { id: pageId, token: data.access_token, diag };
  } catch (error) { diag.direct = String(error?.message || error); }

  try {
    const response = await fetch(`${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
    const data = await response.json();
    if (response.ok && Array.isArray(data.data)) {
      diag.accounts = data.data.length;
      const match = data.data.find((page) => page.id === pageId) || data.data[0];
      if (match?.access_token) return { id: match.id, token: match.access_token, diag };
    } else {
      diag.accounts = data?.error?.message || `HTTP ${response.status}`;
    }
  } catch (error) { diag.accounts = String(error?.message || error); }

  return { id: pageId, token, diag };
}

async function postToFacebook(message) {
  const pageId = env('FB_PAGE_ID', DEFAULT_PAGE_ID);
  const token = env('FB_PAGE_TOKEN');
  if (!token) return { posted: false, reason: 'FB_PAGE_TOKEN not set' };
  try {
    const page = await resolvePageContext(token, pageId);
    const response = await fetch(`${FB_API}/${page.id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: page.token })
    });
    const data = await response.json();
    if (!response.ok) return { posted: false, error: data?.error?.message || `HTTP ${response.status}`, diag: page.diag };
    return { posted: true, id: data.id, diag: page.diag };
  } catch (error) {
    return { posted: false, error: String(error?.message || error) };
  }
}

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function emailOwner(message, theme, facebook) {
  const key = env('RESEND_API_KEY');
  const to = env('MESSAGE_RECIPIENT', env('RESEND_TO_EMAIL'));
  const from = env('RESEND_FROM_EMAIL');
  if (!key || !to || !from) return { emailed: false, reason: 'RESEND_API_KEY, RESEND_FROM_EMAIL, or MESSAGE_RECIPIENT/RESEND_TO_EMAIL is missing' };

  const status = facebook?.posted
    ? 'Already posted to the Facebook Page. This email is your delivery record and share-ready copy.'
    : 'Review copy only. This message has not been auto-posted to Facebook.';
  const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#10241c"><div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#9a742d;font-weight:700;margin-bottom:10px">Apropos Message Horse · Daily post</div><h2 style="margin:0 0 8px">${escapeHtml(theme.name)}</h2><div style="font-size:13px;color:#3c5249;margin-bottom:16px">${escapeHtml(status)}</div><div style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:15px;line-height:1.6">${escapeHtml(message)}</div><div style="margin-top:16px;font-size:13px"><a href="${theme.url}">${theme.url}</a></div></div>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: `Apropos Message Horse — ${theme.name}`, html })
    });
    if (!response.ok) {
      const body = await response.text();
      return { emailed: false, error: `Resend HTTP ${response.status}`, detail: body.slice(0, 300) };
    }
    return { emailed: true };
  } catch (error) {
    return { emailed: false, error: String(error?.message || error) };
  }
}

export const config = { schedule: '0 15 * * *' };

export default async (req) => {
  let dry = false;
  try { dry = new URL(req.url).searchParams.get('dry') === '1'; } catch (_) {}

  const configuredMode = env('MESSAGE_HORSE_MODE', 'email').toLowerCase();
  const mode = dry ? 'preview' : configuredMode;
  const theme = pickTheme();

  if (!dry && mode === 'paused') {
    return new Response(JSON.stringify({ ran: new Date().toISOString(), mode, skipped: true, reason: 'MESSAGE_HORSE_MODE is paused' }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  if (!['preview', 'email', 'post', 'both'].includes(mode)) {
    return new Response(JSON.stringify({ ran: new Date().toISOString(), mode, error: 'Unsupported MESSAGE_HORSE_MODE' }, null, 2), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  let message;
  try { message = await generateMessage(theme); }
  catch (_) { message = `${theme.brief}\n\nLearn more: ${theme.url}`; }

  const result = { ran: new Date().toISOString(), theme: theme.key, property: theme.name, link: theme.url, mode };
  if (!dry && (mode === 'post' || mode === 'both')) result.facebook = await postToFacebook(message);
  if (!dry && (mode === 'email' || mode === 'both')) result.email = await emailOwner(message, theme, result.facebook);
  result.message = message;

  return new Response(JSON.stringify(result, null, 2), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
