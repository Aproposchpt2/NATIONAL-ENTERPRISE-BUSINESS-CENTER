// Apropos Message Horse — daily social distribution for the current APROPOS property suite.
// Generates one on-brand Facebook post, optionally publishes it to the Facebook Page,
// and optionally emails the owner a copy/confirmation.
//
// MESSAGE_HORSE_MODE:
//   paused = generate only; do not post or email
//   email  = email the generated post for review
//   post   = publish to the Facebook Page
//   both   = publish to Facebook and email the owner
//
// ?dry=1 always forces preview mode and never publishes or emails.

const FB_API = 'https://graph.facebook.com/v21.0';
const MODEL = process.env.MESSAGE_MODEL || 'claude-sonnet-4-6';
const CORPORATE = 'https://aproposgroupllc.com';

const THEMES = [
  {
    key: 'corporate-ai-procurement',
    property: 'Apropos Group LLC',
    url: 'https://aproposgroupllc.com/ai-procurement-modernization',
    brief: 'Explain how AI can modernize procurement work by improving opportunity intelligence, qualification, workflow automation and decision support while keeping human accountability in the process.'
  },
  {
    key: 'marketplace-opportunity-discovery',
    property: 'APROPOS Marketing Marketplace',
    url: 'https://marketplace.aproposgroupllc.com',
    brief: 'Help small businesses understand that government-contract discovery should lead them to the right contracting pathway instead of forcing them to search disconnected systems without context.'
  },
  {
    key: 'federal-contractor-matching',
    property: 'Registered Federal Contractors Portal',
    url: 'https://federalcontractorportal.aproposgroupllc.com/guides/',
    brief: 'Explain the value of matching federal opportunities to a contractor profile using signals such as NAICS, registration status, certifications and fit before investing time in a solicitation.'
  },
  {
    key: 'sled-contract-opportunities',
    property: 'National Corporate Contract Exchange',
    url: 'https://natcorp.aproposgroupllc.com/guides/',
    brief: 'Explain that state, local and education contracting is fragmented across many jurisdictions and portals, and that businesses benefit from a structured SLED opportunity-discovery and matching process.'
  },
  {
    key: 'nevada-business-readiness',
    property: 'Nevada Enterprise Business Center',
    url: 'https://nebc.aproposgroupllc.com/guides/',
    brief: 'Explain business readiness as the operating, financial, planning and management evidence needed to take the next growth action, and encourage structured self-assessment before pursuing funding or expansion.'
  },
  {
    key: 'marketplace-bid-readiness',
    property: 'APROPOS Marketing Marketplace',
    url: 'https://marketplace.aproposgroupllc.com',
    brief: 'Teach a practical contracting lesson: finding an opportunity is only the beginning; businesses should evaluate fit, requirements, timing and capacity before committing resources to pursue it.'
  },
  {
    key: 'apropos-connected-ecosystem',
    property: 'Apropos Group LLC',
    url: CORPORATE,
    brief: 'Introduce the APROPOS ecosystem as a connected set of focused business and procurement tools: corporate AI procurement modernization, public opportunity discovery, federal contractor matching, state/local SLED matching, and Nevada business readiness.'
  }
];

function pickTheme() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  return THEMES[dayIndex % THEMES.length];
}

async function generateMessage(theme) {
  const link = theme.url || CORPORATE;
  if (!process.env.ANTHROPIC_API_KEY) {
    return `${theme.brief}\n\nLearn more: ${link}`;
  }

  const prompt = `You write the daily Facebook post for Apropos Group LLC and its current business/procurement technology properties.

Today's featured property: ${theme.property}
Today's angle: ${theme.brief}
Destination: ${link}

Voice: confident, useful, plain-spoken and professional. Sound like an operator who understands procurement and business workflows, not an ad generator.

Write ONE Facebook post:
- Start with a strong, specific first-line hook.
- Give 1–3 short paragraphs of genuine educational or practical value.
- Make factual, measured claims only; do not promise contract awards, funding approval, rankings, or guaranteed outcomes.
- Do not imply government affiliation or endorsement.
- Mention the featured property naturally when useful.
- End with a clear call to action and the exact destination ${link}.
- Use at most 1–2 relevant hashtags, or none.
- No emoji spam.
- Output ONLY the post text, ready to publish.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(data?.error?.message || 'AI generation failed');
  const text = (data.content || []).map(c => c.text || '').join('').trim();
  return text || `${theme.brief}\n\nLearn more: ${link}`;
}

async function resolvePageContext(token, pageId) {
  const diag = {};
  try {
    const r = await fetch(`${FB_API}/${pageId}?fields=access_token,name&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    diag.direct = r.ok ? (d.access_token ? 'got-token' : 'no-token') : (d?.error?.message || ('HTTP ' + r.status));
    if (r.ok && d.access_token) return { id: pageId, token: d.access_token, diag };
  } catch (e) {
    diag.direct = String(e.message || e);
  }

  try {
    const r = await fetch(`${FB_API}/me/accounts?fields=id,name,access_token&access_token=${encodeURIComponent(token)}`);
    const d = await r.json();
    if (r.ok && Array.isArray(d.data)) {
      diag.accounts = d.data.length;
      const match = d.data.find(p => p.id === pageId) || d.data[0];
      if (match && match.access_token) return { id: match.id, token: match.access_token, diag };
    } else {
      diag.accounts = d?.error?.message || ('HTTP ' + r.status);
    }
  } catch (e) {
    diag.accounts = String(e.message || e);
  }

  return { id: pageId, token, diag };
}

async function postToFacebook(message) {
  const pageId = process.env.FB_PAGE_ID || '61573363201770';
  const token = process.env.FB_PAGE_TOKEN;
  if (!token) return { posted: false, reason: 'FB_PAGE_TOKEN not set' };

  try {
    const ctx = await resolvePageContext(token, pageId);
    const r = await fetch(`${FB_API}/${ctx.id}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, access_token: ctx.token })
    });
    const d = await r.json();
    if (!r.ok) return { posted: false, error: d?.error?.message || ('HTTP ' + r.status), diag: ctx.diag };
    return { posted: true, id: d.id, diag: ctx.diag };
  } catch (e) {
    return { posted: false, error: String(e.message || e) };
  }
}

async function emailOwner(message, fb, theme) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.MESSAGE_RECIPIENT || process.env.RESEND_TO_EMAIL;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!key || !to || !from) return { emailed: false, reason: 'Resend env not set' };

  const status = fb && fb.posted
    ? `Posted successfully to the Facebook Page${fb.id ? ` (${fb.id})` : ''}.`
    : fb && fb.error
      ? `Facebook posting failed: ${fb.error}`
      : 'Facebook publishing was not requested for this run.';

  const safeMessage = String(message).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const html = `<div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:24px;color:#10241c">
    <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7a5a16;font-weight:700;margin-bottom:10px">Apropos Message Horse · Daily distribution report</div>
    <div style="font-size:14px;font-weight:700;margin-bottom:8px">${theme.property}</div>
    <div style="font-size:13px;color:#3c5249;margin-bottom:16px">${status}</div>
    <div style="background:#fbf9f3;border:1px solid #e3ddcf;border-radius:12px;padding:20px;white-space:pre-wrap;font-size:15px;line-height:1.6">${safeMessage}</div>
    <div style="font-size:12px;color:#5b6d65;margin-top:14px">Destination: ${theme.url}</div>
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject: `Apropos Message Horse — ${theme.property}`,
        html
      })
    });
    if (!r.ok) {
      let detail = '';
      try { detail = JSON.stringify(await r.json()); } catch (_) {}
      return { emailed: false, error: detail || ('HTTP ' + r.status) };
    }
    return { emailed: true };
  } catch (e) {
    return { emailed: false, error: String(e.message || e) };
  }
}

export const config = { schedule: '0 15 * * *' }; // 15:00 UTC daily; 8am PDT / 7am PST.

export default async (req) => {
  let dry = false;
  try { dry = new URL(req.url).searchParams.get('dry') === '1'; } catch (_) {}

  const configuredMode = (process.env.MESSAGE_HORSE_MODE || 'email').toLowerCase();
  const mode = dry ? 'preview' : configuredMode;
  const theme = pickTheme();

  let message;
  try {
    message = await generateMessage(theme);
  } catch (_) {
    message = `${theme.brief}\n\nLearn more: ${theme.url || CORPORATE}`;
  }

  const result = {
    ran: new Date().toISOString(),
    theme: theme.key,
    property: theme.property,
    link: theme.url || CORPORATE,
    mode
  };

  if (!dry && mode === 'paused') result.paused = true;
  if (!dry && (mode === 'post' || mode === 'both')) result.facebook = await postToFacebook(message);
  if (!dry && (mode === 'email' || mode === 'both')) result.email = await emailOwner(message, result.facebook, theme);
  result.message = message;

  return new Response(JSON.stringify(result, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
