'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateProfile, requestedPrograms, validateSourceEnvelope, rankMatches } = require('../netlify/functions/_funding-match');

const profileInput = { state: 'nv', amount: 50000, use: 'equipment', capital: 'open', revenue: 250000, employees: 3 };
const envelopeInput = {
  snapshot_sha256: 'a'.repeat(64),
  generated_at: '2026-08-17T00:00:00Z',
  records: [
    { id: 'm1', program: 'microloan', name: 'Nevada Microloan Source', state: 'NV', city: 'Las Vegas', source_url: 'https://www.sba.gov/' },
    { id: 's1', program: 'sbic', name: 'Investment Source', state: 'CA', city: 'Los Angeles', source_url: 'https://www.sba.gov/' }
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

test('ranks same-state controlled records higher', () => {
  const profile = validateProfile(profileInput).profile;
  const envelope = validateSourceEnvelope(envelopeInput);
  const result = rankMatches(profile, envelope);
  assert.equal(result.matches[0].id, 'm1');
  assert.equal(result.matches.length, 2);
  assert.equal(result.snapshot_sha256, 'a'.repeat(64));
});
