'use strict';
const fs=require('fs');const path=require('path');const root=process.cwd();
const pages=[
['guides/index.html','https://nebc.aproposgroupllc.com/guides/'],
['guides/business-readiness-assessment/index.html','https://nebc.aproposgroupllc.com/guides/business-readiness-assessment/'],
['guides/funding-readiness-nevada/index.html','https://nebc.aproposgroupllc.com/guides/funding-readiness-nevada/'],
['guides/business-grants-nevada/index.html','https://nebc.aproposgroupllc.com/guides/business-grants-nevada/'],
['guides/small-business-loans-nevada/index.html','https://nebc.aproposgroupllc.com/guides/small-business-loans-nevada/'],
['guides/government-contract-working-capital/index.html','https://nebc.aproposgroupllc.com/guides/government-contract-working-capital/'],
['guides/business-planning-nevada/index.html','https://nebc.aproposgroupllc.com/guides/business-planning-nevada/']
];
const retired=['capgenmkt.aproposgroupllc.com','ngcc.aproposgroupllc.com','businesscontracts.aproposgroupllc.com','gcpdc.aproposgroupllc.com','cdc.aproposgroupllc.com','ai4-product-purchasing.ai4businesses.org'];
const failures=[];const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
for(const [file,url] of pages){const p=path.join(root,file);if(!fs.existsSync(p)){failures.push(`${file} missing`);continue;}const v=fs.readFileSync(p,'utf8');if(!v.includes(`<link rel="canonical" href="${url}">`))failures.push(`${file} canonical mismatch`);if(!v.includes('name="robots" content="index,follow'))failures.push(`${file} not indexable`);if(!v.includes('National Enterprise Business Center'))failures.push(`${file} missing canonical NEBC identity`);if(v.includes('Nevada Enterprise Business Center'))failures.push(`${file} contains noncanonical NEBC entity name`);if(!v.includes('/assessment.html'))failures.push(`${file} missing assessment path`);if(!sitemap.includes(`<loc>${url}</loc>`))failures.push(`${file} missing sitemap entry`);for(const token of retired)if(v.includes(token))failures.push(`${file} contains retired property ${token}`);}
const hub=fs.readFileSync(path.join(root,'guides/index.html'),'utf8');
for(const slug of ['business-readiness-assessment','funding-readiness-nevada','business-grants-nevada','small-business-loans-nevada','government-contract-working-capital','business-planning-nevada'])if(!hub.includes(`/guides/${slug}/`))failures.push(`guide hub missing ${slug}`);
if(!hub.includes('business.nv.gov')||!hub.includes('goed.nv.gov'))failures.push('hub missing official Nevada resource links');
if(!hub.includes('data-geo-answer'))failures.push('hub missing answer-first GEO block');
if(!hub.includes('"@type":"BreadcrumbList"'))failures.push('hub missing breadcrumb graph');
if(!hub.includes('"publisher"'))failures.push('hub missing publisher attribution');
if(!hub.includes('"dateModified":"2026-08-22"'))failures.push('hub missing current freshness signal');
for(const file of ['guides/business-grants-nevada/index.html','guides/small-business-loans-nevada/index.html','guides/government-contract-working-capital/index.html']){const v=fs.readFileSync(path.join(root,file),'utf8');if(!v.includes('data-geo-answer'))failures.push(`${file} missing answer-first GEO block`);if(!v.includes('"@type":"FAQPage"'))failures.push(`${file} missing FAQ schema`);if(!v.includes('"@type":"BreadcrumbList"'))failures.push(`${file} missing breadcrumb schema`);if(!v.includes('Apropos Group LLC'))failures.push(`${file} missing parent-organization attribution`);}
if(failures.length){console.error('[nebc-nevada-readiness-wave1] Validation failed:');failures.forEach(f=>console.error(`- ${f}`));process.exit(1);}console.log('[nebc-nevada-readiness-wave1] PASS — National Enterprise Business Center identity + Nevada readiness guide hub + 6 authority pages are canonical, indexable, sitemap-listed, current-property routed, retired-property clean, and GEO-semantic ready.');