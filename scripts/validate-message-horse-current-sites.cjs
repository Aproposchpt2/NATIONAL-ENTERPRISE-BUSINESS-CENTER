'use strict';

const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'netlify/functions/message-horse.js');
const source = fs.readFileSync(file, 'utf8');

const required = [
  'https://aproposgroupllc.com/ai-procurement-modernization',
  'https://marketplace.aproposgroupllc.com/government-contract-intelligence/',
  'https://federalcontractorportal.aproposgroupllc.com/guides/',
  'https://natcorp.aproposgroupllc.com/guides/',
  'https://nebc.aproposgroupllc.com/guides/',
  "env('MESSAGE_HORSE_MODE', 'email')",
  "mode === 'paused'",
  'MESSAGE_RECIPIENT',
  'FB_PAGE_TOKEN',
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

const failures = [];
for (const token of required) {
  if (!source.includes(token)) failures.push(`missing required Message Horse token: ${token}`);
}
for (const token of retired) {
  if (source.includes(token)) failures.push(`retired property remains in Message Horse: ${token}`);
}
if (source.includes('process.env')) failures.push('Message Horse should use Netlify.env for environment access');

if (failures.length) {
  console.error('[message-horse-current-sites] Validation failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[message-horse-current-sites] PASS — Message Horse targets the five current APROPOS properties, preserves paused/review controls, uses current Netlify env access, and contains no retired property destinations.');
