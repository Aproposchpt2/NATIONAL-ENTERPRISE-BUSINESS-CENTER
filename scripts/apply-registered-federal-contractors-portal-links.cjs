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

// These two NEBC files use the former NGCC domain for state/local routing.
// State/local opportunities belong to NAT-CORP, not the federal portal.
patch('netlify/functions/assistant.js', [
  ['https://ngcc.aproposgroupllc.com', 'https://natcorp.aproposgroupllc.com'],
]);
patch('netlify/functions/message-horse.js', [
  ['https://ngcc.aproposgroupllc.com', 'https://natcorp.aproposgroupllc.com'],
]);

console.log('[nebc-portal-rebrand] Applied current federal portal identity, APROPOS entity link, and corrected state/local routes.');
