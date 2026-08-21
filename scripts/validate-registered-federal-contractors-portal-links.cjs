'use strict';

const fs = require('fs');
const failures = [];
const home = fs.readFileSync('index.html', 'utf8');
const assistant = fs.readFileSync('netlify/functions/assistant.js', 'utf8');
const horse = fs.readFileSync('netlify/functions/message-horse.js', 'utf8');

if (!home.includes('Registered Federal Contractors Portal')) failures.push('homepage does not use current federal portal name');
if (!home.includes('https://federalcontractorportal.aproposgroupllc.com')) failures.push('homepage does not use primary federal portal domain');
if (!home.includes('https://aproposgroupllc.com/#organization')) failures.push('NEBC parentOrganization is not linked to the corporate APROPOS entity');
if (home.includes('National Government Contract Center')) failures.push('homepage still presents former federal portal name');
if (home.includes('https://ngcc.aproposgroupllc.com')) failures.push('homepage still links to former primary NGCC domain');
if (assistant.includes('https://ngcc.aproposgroupllc.com')) failures.push('Morgan state/local routing still uses former NGCC domain');
if (horse.includes('https://ngcc.aproposgroupllc.com')) failures.push('Message Horse state/local routing still uses former NGCC domain');

if (failures.length) {
  console.error('[nebc-portal-rebrand] Validation failed:');
  failures.forEach(f => console.error(`- ${f}`));
  process.exit(1);
}
console.log('[nebc-portal-rebrand] PASS — federal identity, corporate entity link, and state/local routing are consistent.');
