'use strict';
// Shared Morgan session helpers. Server-authenticated restoration remains authoritative;
// sessionStorage is only an active-browser convenience cache.
(function (root) {
  function normalizeMessages(value) {
    if (!Array.isArray(value)) return [];
    return value
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .map(m => ({ role: m.role, content: String(m.content).slice(0, 4000) }))
      .slice(-24);
  }

  function read(member) {
    const r = member && member.morganRestoration;
    if (!r || !['restored', 'none', 'unavailable'].includes(r.status)) return { status: 'none', session: null };
    if (r.status !== 'restored') return { status: r.status, session: null };
    const s = r.session || {};
    const messages = normalizeMessages(s.messages);
    if (!s.sessionId || !messages.length) return { status: 'none', session: null };
    return { status: 'restored', session: { sessionId: String(s.sessionId), savedStage: String(s.savedStage || ''), updatedAt: s.updatedAt || null, messages } };
  }

  function rememberSessionId(sessionId) {
    try { if (sessionId) sessionStorage.setItem('nebc_morgan_session_id', String(sessionId)); } catch (_) {}
  }

  function cache(member, sessionId, messages) {
    if (!member || !sessionId) return;
    const clean = normalizeMessages(messages);
    member.morganRestoration = {
      status: clean.length ? 'restored' : 'none',
      session: clean.length ? { sessionId: String(sessionId), savedStage: '2', updatedAt: new Date().toISOString(), messages: clean } : null,
    };
    try { Store.set('abc_member', member); } catch (_) {}
    rememberSessionId(sessionId);
  }

  root.MorganSession = { normalizeMessages, read, cache, rememberSessionId };
})(window);
