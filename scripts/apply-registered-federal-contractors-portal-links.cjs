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

// Phase 2C performance: the existing hero is served locally as an explicit image
// so the browser can discover, prioritize, size, and paint the LCP resource early.
const heroUrl = '/assets/nebc-hero.webp';
const heroMobileUrl = '/assets/nebc-hero-800.webp';
const heroAvifUrl = '/.netlify/images?url=/assets/nebc-hero.webp&amp;w=1600&amp;fm=avif&amp;q=40';
const heroMobileAvifUrl = '/.netlify/images?url=/assets/nebc-hero.webp&amp;w=800&amp;fm=avif&amp;q=40';
const heroPreload = `<link rel="preload" as="image" href="${heroAvifUrl}" imagesrcset="${heroMobileAvifUrl} 800w, ${heroAvifUrl} 1600w" imagesizes="100vw" type="image/avif" fetchpriority="high">`;
let indexHtml = fs.readFileSync('index.html', 'utf8');
if (!indexHtml.includes(heroUrl)) throw new Error('NEBC performance remediation: active local hero URL not found.');
if (!fs.existsSync('assets/nebc-hero.webp')) throw new Error('NEBC performance remediation: local hero asset not found.');
if (!indexHtml.includes(heroMobileUrl) || !fs.existsSync('assets/nebc-hero-800.webp')) throw new Error('NEBC performance remediation: responsive mobile hero asset not found.');
if (!indexHtml.includes(heroMobileAvifUrl)) throw new Error('NEBC performance remediation: responsive AVIF hero source not found.');
if (!/<\/head>/i.test(indexHtml)) throw new Error('NEBC performance remediation: closing head tag not found.');
if (!indexHtml.includes(heroPreload)) indexHtml = indexHtml.replace(/<\/head>/i, `${heroPreload}\n</head>`);
if ((indexHtml.match(/rel="preload" as="image" href="\/\.netlify\/images\?url=\/assets\/nebc-hero\.webp&amp;w=1600&amp;fm=avif&amp;q=40"/g) || []).length !== 1) {
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
