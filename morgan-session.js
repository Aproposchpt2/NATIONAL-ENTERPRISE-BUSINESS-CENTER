'use strict';
// Shared Morgan session helpers. Server-authenticated restoration remains authoritative;
// sessionStorage is only an active-browser convenience cache.
(function (root) {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
    if (!UUID_RE.test(String(s.sessionId || '')) || !messages.length) return { status: 'none', session: null };
    return { status: 'restored', session: { sessionId: String(s.sessionId), savedStage: String(s.savedStage || ''), updatedAt: s.updatedAt || null, messages } };
  }

  function rememberSessionId(sessionId) {
    try { if (UUID_RE.test(String(sessionId || ''))) sessionStorage.setItem('nebc_morgan_session_id', String(sessionId)); } catch (_) {}
  }

  function createUuid() {
    try { if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID(); } catch (_) {}
    // UUIDv4-compatible fallback for browsers without crypto.randomUUID.
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.floor(Math.random() * 16);
      const v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  function getBrowserSessionId() {
    let current = '';
    try { current = sessionStorage.getItem('nebc_morgan_session_id') || ''; } catch (_) {}
    if (UUID_RE.test(current)) return current;
    const created = createUuid();
    rememberSessionId(created);
    return created;
  }

  function cache(member, sessionId, messages) {
    if (!member || !UUID_RE.test(String(sessionId || ''))) return;
    const clean = normalizeMessages(messages);
    member.morganRestoration = {
      status: clean.length ? 'restored' : 'none',
      session: clean.length ? { sessionId: String(sessionId), savedStage: '2', updatedAt: new Date().toISOString(), messages: clean } : null,
    };
    try { Store.set('abc_member', member); } catch (_) {}
    rememberSessionId(sessionId);
  }

  root.MorganSession = { normalizeMessages, read, cache, rememberSessionId, getBrowserSessionId };
})(window);
