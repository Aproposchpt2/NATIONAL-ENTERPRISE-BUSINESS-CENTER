'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateProfile,
  requestedPrograms,
  validateSourceEnvelope,
  loadEmbeddedEnvelope,
  buildIntelligence,
  rankMatches,
  SOURCE_SNAPSHOT_SHA256,
  CATALOG_PROJECTION_SHA256,
  CATALOG_RECORD_COUNT
} = require('../netlify/functions/_funding-match');

const profileInput = { state: 'nv', amount: 50000, use: 'equipment', capital: 'open', revenue: 250000, employees: 3 };
const envelopeInput = {
  snapshot_sha256: 'a'.repeat(64),
  generated_at: '2026-08-17T00:00:00Z',
  records: [
    { id: 'm1', program: 'microloan', name: 'Nevada Microloan Source', state: 'NV', city: 'Las Vegas' },
    { id: 's1', program: 'sbic', name: 'Investment Source', state: 'CA', city: 'Los Angeles' }
  ]
};

test('validates and normalizes a funding profile', () => {
  const result = validateProfile(profileInput);
  assert.equal(result.ok, true);
  assert.equal(result.profile.state, 'NV');
});

test('routes capital preference without claiming eligibility', () => {
  assert.deepEqual(requestedPrograms({ capital: 'debt' }), ['microloan']);
  assert.deepEqual(requestedPrograms({ capital: 'investment' }), ['sbic']);
  assert.deepEqual(requestedPrograms({ capital: 'open' }), ['microloan', 'sbic']);
});

test('rejects an uncontrolled source envelope', () => {
  assert.throws(() => validateSourceEnvelope({ records: [] }), /SOURCE_SNAPSHOT_HASH_INVALID/);
});

test('loads the embedded catalog only when count and projection hash match', () => {
  const envelope = loadEmbeddedEnvelope();
  assert.equal(envelope.records.length, 549);
  assert.equal(CATALOG_RECORD_COUNT, 549);
  assert.equal(envelope.snapshot_sha256, CATALOG_PROJECTION_SHA256);
  assert.equal(SOURCE_SNAPSHOT_SHA256, '86e86b9c6b1d29bdeff5d5f06b00294acbd1a2116ac448981d6bdf1f0ff89293');
});

test('funding intelligence separates fit evidence from unresolved confirmation', () => {
  const profile = validateProfile(profileInput).profile;
  const intel = buildIntelligence(profile, envelopeInput.records[0]);
  assert.ok(intel.fit.some(x => x.includes('business state')));
  assert.ok(intel.gaps.some(x => x.includes('requested amount')));
  assert.match(intel.nextAction, /Verify/);
  assert.equal(intel.relevance, 90);
});

test('out-of-state source is a relevance candidate, not an eligibility finding', () => {
  const profile = validateProfile({ ...profileInput, capital: 'investment', use: 'growth' }).profile;
  const intel = buildIntelligence(profile, envelopeInput.records[1]);
  assert.ok(intel.gaps.some(x => x.includes('serves businesses in NV')));
  assert.ok(intel.fit.some(x => x.includes('SBIC')));
  assert.equal(intel.relevance, 60);
});

test('ranks same-state controlled records higher and returns intelligence version', () => {
  const profile = validateProfile(profileInput).profile;
  const envelope = validateSourceEnvelope(envelopeInput);
  const result = rankMatches(profile, envelope);
  assert.equal(result.matches[0].id, 'm1');
  assert.equal(result.matches.length, 2);
  assert.equal(result.snapshot_sha256, 'a'.repeat(64));
  assert.equal(result.intelligence_version, 'ABFOP-NEBC-FUNDING-INTELLIGENCE-001');
  assert.ok(Array.isArray(result.matches[0].fit));
  assert.ok(Array.isArray(result.matches[0].gaps));
});

test('embedded catalog returns a bounded prioritized result set', () => {
  const profile = validateProfile(profileInput).profile;
  const result = rankMatches(profile, loadEmbeddedEnvelope());
  assert.equal(result.totalCandidates, 549);
  assert.equal(result.returnedMatches, 25);
  assert.equal(result.matches.length, 25);
  assert.equal(result.catalog_record_count, 549);
});
