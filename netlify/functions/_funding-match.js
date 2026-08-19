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
    ...require('./_funding-catalog-1'),
    ...require('./_funding-catalog-2'),
    ...require('./_funding-catalog-3'),
    ...require('./_funding-catalog-4'),
    ...require('./_funding-catalog-5')
  ];
  if (records.length !== CATALOG_RECORD_COUNT) throw new Error(`CATALOG_COUNT_MISMATCH:${records.length}`);
  const hash = crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex');
  if (hash !== CATALOG_PROJECTION_SHA256) throw new Error('CATALOG_PROJECTION_HASH_MISMATCH');
  return validateSourceEnvelope({
    snapshot_sha256: CATALOG_PROJECTION_SHA256,
    generated_at: CATALOG_GENERATED_AT,
    records
  });
}

function rankMatches(profile, envelope) {
  const programs = requestedPrograms(profile);
  const candidates = envelope.records
    .filter(record => programs.includes(record.program))
    .map(record => {
      let relevance = 50;
      const reasons = [`Program channel matches ${record.program === 'microloan' ? 'debt financing' : 'investment capital'} preference.`];
      if (record.state && record.state === profile.state) {
        relevance += 30;
        reasons.push(`Source is located in ${profile.state}.`);
      } else if (record.state) {
        reasons.push(`Source is located in ${record.state}; geographic/service-area eligibility still requires confirmation.`);
      } else {
        reasons.push('Source record does not establish a state restriction; service area still requires confirmation.');
      }
      if (record.program === 'microloan' && ['working-capital', 'equipment', 'inventory', 'expansion', 'other'].includes(profile.use)) relevance += 10;
      if (record.program === 'sbic' && ['growth', 'expansion', 'other'].includes(profile.use)) relevance += 10;
      return { ...record, relevance: Math.min(relevance, 100), reasons };
    })
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
    disclaimer: 'Screening guidance only. A listed source is not an approval, commitment, guarantee of eligibility, or confirmation that the source serves this business.'
  };
}

module.exports = {
  validateProfile,
  requestedPrograms,
  validateSourceEnvelope,
  loadEmbeddedEnvelope,
  rankMatches,
  SOURCE_SNAPSHOT_SHA256,
  CATALOG_PROJECTION_SHA256,
  CATALOG_RECORD_COUNT
};
