'use strict';

const crypto = require('crypto');

const ALLOWED_PROGRAMS = new Set(['microloan', 'sbic']);
const SOURCE_SNAPSHOT_SHA256 = '86e86b9c6b1d29bdeff5d5f06b00294acbd1a2116ac448981d6bdf1f0ff89293';
const CATALOG_PROJECTION_SHA256 = '8303dc22f2953f1f7f9b4558431328ff38c82ced507f64e6a525f79db4e5aaa0';
const CATALOG_GENERATED_AT = '2026-08-19T00:00:20.307275+00:00';
const CATALOG_RECORD_COUNT = 549;

function clean(value) { return String(value ?? '').trim(); }
function normalizeState(value) { return clean(value).toUpperCase(); }

function validateProfile(input = {}) {
  const amount = Number(input.amount);
  const profile = {
    businessName: clean(input.businessName),
    state: normalizeState(input.state),
    amount,
    use: clean(input.use),
    revenue: input.revenue === '' || input.revenue == null ? null : Number(input.revenue),
    employees: input.employees === '' || input.employees == null ? null : Number(input.employees),
    capital: clean(input.capital || 'open'),
    timing: clean(input.timing || 'now')
  };
  const errors = [];
  if (!profile.state || !/^[A-Z]{2}$/.test(profile.state)) errors.push('state must be a two-letter abbreviation');
  if (!Number.isFinite(profile.amount) || profile.amount <= 0) errors.push('amount must be greater than zero');
  if (!profile.use) errors.push('use is required');
  if (!['open', 'debt', 'investment'].includes(profile.capital)) errors.push('capital is invalid');
  if (profile.revenue != null && (!Number.isFinite(profile.revenue) || profile.revenue < 0)) errors.push('revenue is invalid');
  if (profile.employees != null && (!Number.isInteger(profile.employees) || profile.employees < 0)) errors.push('employees is invalid');
  return { ok: errors.length === 0, errors, profile };
}

function requestedPrograms(profile) {
  if (profile.capital === 'debt') return ['microloan'];
  if (profile.capital === 'investment') return ['sbic'];
  return ['microloan', 'sbic'];
}

function validateSourceEnvelope(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('SOURCE_PAYLOAD_INVALID');
  if (!/^[a-f0-9]{64}$/i.test(clean(payload.snapshot_sha256))) throw new Error('SOURCE_SNAPSHOT_HASH_INVALID');
  if (!clean(payload.generated_at)) throw new Error('SOURCE_GENERATED_AT_MISSING');
  if (!Array.isArray(payload.records)) throw new Error('SOURCE_RECORDS_INVALID');
  const records = payload.records.map((record, index) => {
    if (!record || typeof record !== 'object') throw new Error(`SOURCE_RECORD_INVALID:${index}`);
    const program = clean(record.program).toLowerCase();
    if (!ALLOWED_PROGRAMS.has(program)) throw new Error(`SOURCE_PROGRAM_INVALID:${index}`);
    const id = clean(record.id);
    const name = clean(record.name || record.title);
    if (!id || !name) throw new Error(`SOURCE_IDENTITY_INVALID:${index}`);
    return { ...record, id, name, program, state: normalizeState(record.state), city: clean(record.city), source_url: clean(record.source_url) };
  });
  return { snapshot_sha256: payload.snapshot_sha256.toLowerCase(), generated_at: payload.generated_at, records };
}

function loadEmbeddedEnvelope() {
  const records = [
    ...require('./_funding-catalog-1'), ...require('./_funding-catalog-2'), ...require('./_funding-catalog-3'),
    ...require('./_funding-catalog-4'), ...require('./_funding-catalog-5')
  ];
  if (records.length !== CATALOG_RECORD_COUNT) throw new Error(`CATALOG_COUNT_MISMATCH:${records.length}`);
  const hash = crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
  if (hash !== CATALOG_PROJECTION_SHA256) throw new Error('CATALOG_PROJECTION_HASH_MISMATCH');
  return validateSourceEnvelope({ snapshot_sha256: CATALOG_PROJECTION_SHA256, generated_at: CATALOG_GENERATED_AT, records });
}

function buildIntelligence(profile, record) {
  const fit = [];
  const gaps = [];
  let relevance = 50;

  fit.push(record.program === 'microloan'
    ? 'This source is in the SBA Microloan channel, which aligns with a debt-financing search.'
    : 'This source is an SBA-licensed SBIC, which aligns with an investment-capital search.');

  if (record.state && record.state === profile.state) {
    relevance += 30;
    fit.push(`The source is located in the business state (${profile.state}), increasing geographic relevance.`);
  } else if (record.state) {
    gaps.push(`Confirm that a source located in ${record.state} serves businesses in ${profile.state}.`);
  } else {
    gaps.push('Confirm the source service area because the controlled record does not establish a state location.');
  }

  const microloanUses = ['working-capital', 'equipment', 'inventory', 'expansion', 'other'];
  const sbicUses = ['growth', 'expansion', 'other'];
  if (record.program === 'microloan' && microloanUses.includes(profile.use)) {
    relevance += 10;
    fit.push(`The stated use of funds (${profile.use.replaceAll('-', ' ')}) is directionally consistent with this financing channel.`);
  } else if (record.program === 'sbic' && sbicUses.includes(profile.use)) {
    relevance += 10;
    fit.push(`The stated use of funds (${profile.use.replaceAll('-', ' ')}) is directionally consistent with growth/investment capital.`);
  } else {
    gaps.push(`Confirm that the proposed use of funds (${profile.use.replaceAll('-', ' ')}) is accepted by this source.`);
  }

  gaps.push(`Confirm that the requested amount ($${Math.round(profile.amount).toLocaleString('en-US')}) fits this source's current financing or investment range.`);
  gaps.push(record.program === 'microloan'
    ? 'Confirm current underwriting requirements, collateral/guaranty requirements if any, documentation, and application availability.'
    : 'Confirm current investment thesis, target company profile, stage, sector preferences, ownership expectations, and minimum/maximum investment size.');

  if (profile.revenue == null) gaps.push('Annual revenue is not yet available for source-level qualification review.');
  if (profile.employees == null) gaps.push('Employee count is not yet available for source-level qualification review.');

  const nextAction = record.program === 'microloan'
    ? `Verify ${record.name}'s service area, current lending parameters, required documents, and application/contact path before treating this as an actionable lending lead.`
    : `Verify ${record.name}'s current investment thesis, check size, sector/stage fit, and contact path before treating this as an actionable capital lead.`;

  return { relevance: Math.min(relevance, 100), fit, gaps, nextAction };
}

function rankMatches(profile, envelope) {
  const programs = requestedPrograms(profile);
  const candidates = envelope.records
    .filter(record => programs.includes(record.program))
    .map(record => ({ ...record, ...buildIntelligence(profile, record) }))
    .sort((a, b) => b.relevance - a.relevance || a.name.localeCompare(b.name));

  return {
    programs,
    matches: candidates.slice(0, 25),
    totalCandidates: candidates.length,
    returnedMatches: Math.min(candidates.length, 25),
    snapshot_sha256: envelope.snapshot_sha256,
    source_snapshot_sha256: SOURCE_SNAPSHOT_SHA256,
    generated_at: envelope.generated_at,
    catalog_record_count: CATALOG_RECORD_COUNT,
    intelligence_version: 'ABFOP-NEBC-FUNDING-INTELLIGENCE-001',
    disclaimer: 'Screening guidance only. Fit indicators are not eligibility findings, approvals, commitments, or confirmation that a source will serve or finance the business.'
  };
}

module.exports = {
  validateProfile, requestedPrograms, validateSourceEnvelope, loadEmbeddedEnvelope,
  buildIntelligence, rankMatches, SOURCE_SNAPSHOT_SHA256, CATALOG_PROJECTION_SHA256, CATALOG_RECORD_COUNT
};
