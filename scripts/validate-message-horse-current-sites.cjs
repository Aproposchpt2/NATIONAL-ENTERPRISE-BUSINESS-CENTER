'use strict';
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const file = path.join(root, 'netlify/functions/message-horse.js');
const source = fs.readFileSync(file, 'utf8');
const failures = [];

const required = [
  'https://aproposgroupllc.com',
  'https://marketplace.aproposgroupllc.com',
  'https://federalcontractorportal.aproposgroupllc.com',
  'https://natcorp.aproposgroupllc.com',
  'https://nebc.aproposgroupllc.com',
  "mode === 'paused'",
  "mode === 'both'",
  "schedule: '0 15 * * *'"
];

const retired = [
  'aibizcenter.aproposgroupllc.com',
  'ngcc.aproposgroupllc.com',
  'capgen.aproposgroupllc.com',
  'capgenmkt.aproposgroupllc.com',
  'businesscontracts.aproposgroupllc.com',
  'gcpdc.aproposgroupllc.com',
  'cdc.aproposgroupllc.com',
  'ai4-product-purchasing.ai4businesses.org'
];

for (const token of required) {
  if (!source.includes(token)) failures.push(`missing required Message Horse control/reference: ${token}`);
}
for (const token of retired) {
  if (source.includes(token)) failures.push(`retired public destination remains in Message Horse: ${token}`);
}

if (!source.includes('Apropos Group LLC')) failures.push('missing current parent organization identity');
if (!source.includes('Registered Federal Contractors Portal')) failures.push('missing RFCP identity');
if (!source.includes('National Corporate Contract Exchange')) failures.push('missing NAT-CORP identity');
if (!source.includes('Nevada Enterprise Business Center')) failures.push('missing NEBC identity');
if (!source.includes('APROPOS Marketing Marketplace')) failures.push('missing Marketplace identity');
if (!source.includes('do not promise contract awards, funding approval, rankings, or guaranteed outcomes')) failures.push('missing controlled-claims prompt safeguard');
if (!source.includes('Do not imply government affiliation or endorsement')) failures.push('missing government-affiliation safeguard');

if (failures.length) {
  console.error('[message-horse-current-sites] Validation failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('[message-horse-current-sites] PASS — current five-property rotation, scheduling, mode controls, claim safeguards, and retired-destination cleanup verified.');
