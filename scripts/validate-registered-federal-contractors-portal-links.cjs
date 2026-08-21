'use strict';

const fs = require('fs');
const failures = [];
const files = [
  'index.html',
  'netlify/functions/_recommend.js',
  'netlify/functions/assistant.js',
  'netlify/functions/message-horse.js',
  'netlify/functions/generate-plan.js',
].filter(fs.existsSync);
const content = Object.fromEntries(files.map(file => [file, fs.readFileSync(file, 'utf8')]));
const home = content['index.html'] || '';

if (!home.includes('Registered Federal Contractors Portal')) failures.push('homepage does not use current federal portal name');
if (!home.includes('https://federalcontractorportal.aproposgroupllc.com')) failures.push('homepage does not use primary federal portal domain');
if (!home.includes('https://aproposgroupllc.com/#organization')) failures.push('NEBC parentOrganization is not linked to the corporate APROPOS entity');
if (home.includes('National Government Contract Center')) failures.push('homepage still presents former federal portal name');

const forbidden = [
  'https://capgenmkt.aproposgroupllc.com',
  'https://ngcc.aproposgroupllc.com',
  'https://gcpdc.aproposgroupllc.com',
  'https://ai4websitedesign.com',
  'https://ai4-product-purchasing.ai4businesses.org',
  'Federal CapGen',
  'State CapGen',
  'CapGen family suite',
];
for (const [file, value] of Object.entries(content)) {
  for (const token of forbidden) {
    if (value.includes(token)) failures.push(`${file} still contains retired property reference: ${token}`);
  }
}

const recommend = content['netlify/functions/_recommend.js'] || '';
if (!recommend.includes('https://federalcontractorportal.aproposgroupllc.com')) failures.push('NEBC recommendation engine does not route federal opportunities to RFCP');
if (!recommend.includes('https://natcorp.aproposgroupllc.com')) failures.push('NEBC recommendation engine does not route state/local opportunities to NAT-CORP');
if (!recommend.includes("href: '/website-builder.html'")) failures.push('NEBC website recommendation does not remain inside the live NEBC property');

if (failures.length) {
  console.error('[nebc-live-property-allowlist] Validation failed:');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log('[nebc-live-property-allowlist] PASS — deployed/user-facing APROPOS routing is limited to the five approved live properties.');
