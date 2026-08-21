'use strict';

const fs = require('fs');

function patch(file, replacements) {
  let value = fs.readFileSync(file, 'utf8');
  for (const [from, to] of replacements) value = value.replaceAll(from, to);
  fs.writeFileSync(file, value, 'utf8');
}

// Public NEBC handoff: current federal portal identity + primary domain.
patch('index.html', [
  ['National Government Contract Center', 'Registered Federal Contractors Portal'],
  ['https://ngcc.aproposgroupllc.com', 'https://federalcontractorportal.aproposgroupllc.com'],
  [
    '"parentOrganization": {\n        "@type": "Organization",\n        "name": "Apropos Group LLC",',
    '"parentOrganization": {\n        "@type": "Organization",\n        "@id": "https://aproposgroupllc.com/#organization",\n        "name": "APROPOS Group LLC",'
  ],
]);

// Phase 2B performance: NEBC's LCP candidate is a remote Unsplash CSS hero.
// Preconnect only to the hero origin and preload only the above-the-fold image;
// do not preload the three below-the-fold photographic sections.
const heroUrl = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=85';
const heroPreconnect = '<link rel="preconnect" href="https://images.unsplash.com">';
const heroPreload = `<link rel="preload" as="image" href="${heroUrl}" fetchpriority="high">`;
let indexHtml = fs.readFileSync('index.html', 'utf8');
if (!indexHtml.includes(heroUrl)) throw new Error('NEBC performance remediation: active remote hero URL not found.');
if (!indexHtml.includes(heroPreconnect)) {
  if (!/<\/head>/i.test(indexHtml)) throw new Error('NEBC performance remediation: closing head tag not found.');
  indexHtml = indexHtml.replace(/<\/head>/i, `${heroPreconnect}\n</head>`);
}
if (!indexHtml.includes(heroPreload)) {
  indexHtml = indexHtml.replace(/<\/head>/i, `${heroPreload}\n</head>`);
}
if ((indexHtml.match(/rel="preload" as="image" href="https:\/\/images\.unsplash\.com\/photo-1486406146926-c627a92ad1ab/g) || []).length !== 1) {
  throw new Error('NEBC performance remediation: hero preload must appear exactly once.');
}
fs.writeFileSync('index.html', indexHtml, 'utf8');

// These two NEBC files use the former NGCC domain for state/local routing.
// State/local opportunities belong to NAT-CORP, not the federal portal.
patch('netlify/functions/assistant.js', [
  ['https://ngcc.aproposgroupllc.com', 'https://natcorp.aproposgroupllc.com'],
]);
patch('netlify/functions/message-horse.js', [
  ['https://ngcc.aproposgroupllc.com', 'https://natcorp.aproposgroupllc.com'],
]);

console.log('[nebc-portal-rebrand] Applied current federal portal identity, APROPOS entity link, corrected state/local routes, and prioritized the homepage hero.');
require('./apply-nonblocking-fonts.cjs');
