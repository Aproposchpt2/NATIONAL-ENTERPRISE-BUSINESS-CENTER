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
  ['https://capgenmkt.aproposgroupllc.com', 'https://federalcontractorportal.aproposgroupllc.com'],
  [
    '"parentOrganization": {\n        "@type": "Organization",\n        "name": "Apropos Group LLC",',
    '"parentOrganization": {\n        "@type": "Organization",\n        "@id": "https://aproposgroupllc.com/#organization",\n        "name": "APROPOS Group LLC",'
  ],
]);

// Phase 2B performance: NEBC's LCP candidate is a remote Unsplash CSS hero.
const heroUrl = 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=2400&q=85';
const heroPreconnect = '<link rel="preconnect" href="https://images.unsplash.com">';
const heroPreload = `<link rel="preload" as="image" href="${heroUrl}" fetchpriority="high">`;
let indexHtml = fs.readFileSync('index.html', 'utf8');
if (!indexHtml.includes(heroUrl)) throw new Error('NEBC performance remediation: active remote hero URL not found.');
if (!indexHtml.includes(heroPreconnect)) {
  if (!/<\/head>/i.test(indexHtml)) throw new Error('NEBC performance remediation: closing head tag not found.');
  indexHtml = indexHtml.replace(/<\/head>/i, `${heroPreconnect}\n</head>`);
}
if (!indexHtml.includes(heroPreload)) indexHtml = indexHtml.replace(/<\/head>/i, `${heroPreload}\n</head>`);
if ((indexHtml.match(/rel="preload" as="image" href="https:\/\/images\.unsplash\.com\/photo-1486406146926-c627a92ad1ab/g) || []).length !== 1) {
  throw new Error('NEBC performance remediation: hero preload must appear exactly once.');
}
fs.writeFileSync('index.html', indexHtml, 'utf8');

// Retired-property cleanup. Public/runtime handoffs may reference only the five
// approved APROPOS properties. Historical internal identifiers may remain, but
// no retired property name or domain may be rendered or routed to a user.
const runtimeFiles = [
  'netlify/functions/assistant.js',
  'netlify/functions/message-horse.js',
  'netlify/functions/generate-plan.js',
];
for (const file of runtimeFiles) {
  if (!fs.existsSync(file)) continue;
  patch(file, [
    ['https://capgenmkt.aproposgroupllc.com', 'https://federalcontractorportal.aproposgroupllc.com'],
    ['https://ngcc.aproposgroupllc.com', 'https://natcorp.aproposgroupllc.com'],
    ['https://gcpdc.aproposgroupllc.com', '#assistant'],
    ['https://ai4websitedesign.com', '/website-builder.html'],
    ['https://ai4-product-purchasing.ai4businesses.org/marketing-agent-offer.html', '#assistant'],
    ['Federal CapGen', 'Registered Federal Contractors Portal'],
    ['State CapGen sites', 'National Corporate Contract Exchange'],
    ['State CapGen', 'National Corporate Contract Exchange'],
    ['CapGen family suite', 'APROPOS contract opportunity platforms'],
    ['CapGen onboarding', 'Registered Federal Contractors Portal onboarding'],
    ['CapGen explanation', 'Registered Federal Contractors Portal explanation'],
    ['through CapGen', 'through the Registered Federal Contractors Portal'],
    ['Use CapGen for federal leads and the State CapGen sites for state and local contract leads.', 'Use the Registered Federal Contractors Portal for federal opportunities and NAT-CORP for state and local opportunities.'],
  ]);
}

console.log('[nebc-portal-rebrand] Applied current five-property routing, removed retired public property references, preserved entity links, and prioritized the homepage hero.');
require('./apply-nonblocking-fonts.cjs');
