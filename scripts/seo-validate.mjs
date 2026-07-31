import fs from 'node:fs';

const read = p => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const assert = (condition, message) => { if (!condition) throw new Error(`SEO validation failed: ${message}`); };

const home = read('index.html');
const sitemap = read('sitemap.xml');
const robots = read('robots.txt');

assert(home.includes('<title>Small Business Support, Planning & Resources | NEBC</title>'), 'homepage title not transformed');
assert(home.includes('free business assessment'), 'free assessment positioning missing');
assert(home.includes('"price":"0"'), 'free NEBC membership schema missing');
assert(!home.includes('"price":"24.99"'), 'legacy paid membership schema still present');
assert(!home.includes('Start Free Trial →'), 'legacy free-trial CTA still present');

for (const path of [
  'business-assessment/index.html',
  'small-business-support/index.html',
  'business-planning/index.html'
]) assert(fs.existsSync(new URL(`../${path}`, import.meta.url)), `${path} missing`);

for (const url of ['/business-assessment/','/small-business-support/','/business-planning/']) {
  assert(sitemap.includes(url), `${url} missing from sitemap`);
}

assert(!sitemap.includes('/subscription.html'), 'paid service page must not be treated as NEBC membership acquisition page');
assert(robots.includes('Disallow: /website-preview.html'), 'preview crawl exclusion missing');

console.log('NEBC SEO validation passed.');
