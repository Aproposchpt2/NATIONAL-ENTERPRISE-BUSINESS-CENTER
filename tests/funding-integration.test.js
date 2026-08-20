'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { recommend } = require('../netlify/functions/_recommend');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('assessment captures controlled funding intent', () => {
  const html = read('assessment.html');
  assert.match(html, /type="checkbox" value="funding"/);
  assert.match(html, /Need Business Funding/);
  assert.match(html, /servicesNeeded:needs/);
});

test('funding intent recommends the Business Funding Opportunity Center', () => {
  const result = recommend({ businessStatus: ['gov_regs'], servicesNeeded: ['funding'], businessStageInput: 'existing' });
  const funding = result.recommendedServices.find(service => service.key === 'funding');
  assert.ok(funding);
  assert.equal(funding.label, 'Business Funding Opportunity Center');
  assert.equal(funding.href, '/business-funding.html');
  assert.match(funding.reason, /funding or capital/i);
});

test('returning-member recommendation reconstruction is deterministic', () => {
  const input = { businessStatus: ['gov_regs'], servicesNeeded: ['funding', 'federal_contracts'], businessStageInput: 'contracts' };
  assert.deepEqual(recommend(input), recommend(input));
  assert.ok(recommend(input).recommendedServices.some(service => service.key === 'funding'));
});

test('Morgan funding action resolves to the controlled Funding Center', () => {
  const source = read('netlify/functions/assistant.js');
  assert.match(source, /funding:\s*\{ label: 'Business Funding Opportunity Center →', href: '\/business-funding\.html'/);
  assert.match(source, /\[\[OPEN: funding\]\]/);
  assert.match(source, /Do not search the controlled funding catalog conversationally/);
  assert.match(source, /OPENAI_API_KEY/);
});

test('assessment result carries known funding profile context and makes funding immediate', () => {
  const source = read('netlify/functions/generate-plan.js');
  assert.match(source, /'website', 'funding', 'federal_contracts'/);
  assert.match(source, /email: i\.email,/);
  assert.match(source, /state: i\.state,/);
  assert.match(source, /servicesNeeded: i\.servicesNeeded,/);
});

test('Funding Center uses server API and member profile reuse', () => {
  const html = read('business-funding.html');
  assert.match(html, /Store\.get\('abc_profile'\)/);
  assert.match(html, /Store\.get\('abc_member'\)/);
  assert.match(html, /fetch\('\/\.netlify\/functions\/funding-match'/);
  assert.match(html, /Funding analysis unavailable\./);
  assert.match(html, /Why this deserves review/);
  assert.match(html, /What still needs confirmation/);
  assert.match(html, /Recommended next action/);
});

test('returning-member payload exposes saved state for Funding Center prefill', () => {
  const source = read('netlify/functions/member-otp-verify.js');
  assert.match(source, /select=full_name,business_name,state,/);
  assert.match(source, /state: m\.state \|\| ''/);
});
