import fs from 'node:fs';

const file = new URL('../index.html', import.meta.url);
let html = fs.readFileSync(file, 'utf8');

const replaceMeta = (name, value) => {
  const pattern = new RegExp(`<meta\\s+name=["']${name}["'][^>]*>`, 'i');
  const tag = `<meta name="${name}" content="${value}">`;
  html = pattern.test(html) ? html.replace(pattern, tag) : html.replace('</title>', `</title>${tag}`);
};

const replaceProperty = (property, value) => {
  const pattern = new RegExp(`<meta\\s+property=["']${property}["'][^>]*>`, 'i');
  const tag = `<meta property="${property}" content="${value}">`;
  html = pattern.test(html) ? html.replace(pattern, tag) : html.replace('</title>', `</title>${tag}`);
};

html = html.replace(/<title>.*?<\/title>/i, '<title>Small Business Support, Planning & Resources | NEBC</title>');
replaceMeta('description', 'Start, manage and grow your business with a free business assessment, planning tools, business resources, documents, funding readiness and professional support through NEBC.');
replaceMeta('robots', 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1');
replaceProperty('og:type', 'website');
replaceProperty('og:site_name', 'National Enterprise Business Center');
replaceProperty('og:title', 'National Enterprise Business Center | Free Business Assessment & Support');
replaceProperty('og:description', 'A full-service online business center offering free membership, business assessment, planning resources, documents, funding readiness and growth support.');
replaceProperty('og:url', 'https://nebc.aproposgroupllc.com/');
replaceMeta('twitter:card', 'summary_large_image');
replaceMeta('twitter:title', 'National Enterprise Business Center | Free Business Support');
replaceMeta('twitter:description', 'Free membership, business assessment, planning resources and practical support for starting, managing and growing a business.');

html = html.replace(/>Start Free Trial\s*→</gi, '>Start Free Business Assessment →<');
html = html.replace(/>Start Free Trial</gi, '>Start Free Business Assessment<');

const schema = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://aproposgroupllc.com/#organization',
      name: 'Apropos Group LLC',
      url: 'https://aproposgroupllc.com/'
    },
    {
      '@type': 'WebSite',
      '@id': 'https://nebc.aproposgroupllc.com/#website',
      name: 'National Enterprise Business Center',
      alternateName: 'NEBC',
      url: 'https://nebc.aproposgroupllc.com/',
      publisher: { '@id': 'https://aproposgroupllc.com/#organization' }
    },
    {
      '@type': 'Service',
      '@id': 'https://nebc.aproposgroupllc.com/#service',
      name: 'National Enterprise Business Center Membership',
      serviceType: 'Online small business assessment, planning, readiness and business support',
      areaServed: { '@type': 'Country', name: 'United States' },
      provider: { '@id': 'https://aproposgroupllc.com/#organization' },
      offers: {
        '@type': 'Offer',
        name: 'NEBC Membership',
        price: '0',
        priceCurrency: 'USD',
        description: 'Free NEBC membership. Separately authorized paid services, when offered, are distinct from membership.'
      }
    }
  ]
};

const schemaTag = `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
const schemaPattern = /<script\s+type=["']application\/ld\+json["']>.*?<\/script>/is;
html = schemaPattern.test(html) ? html.replace(schemaPattern, schemaTag) : html.replace('</head>', `${schemaTag}</head>`);

if (process.env.GOOGLE_SITE_VERIFICATION) {
  replaceMeta('google-site-verification', process.env.GOOGLE_SITE_VERIFICATION);
}

if (process.env.GA4_MEASUREMENT_ID && !html.includes('www.googletagmanager.com/gtag/js')) {
  const id = process.env.GA4_MEASUREMENT_ID.replace(/[^A-Za-z0-9-]/g, '');
  const analytics = `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}',{send_page_view:true});</script>`;
  html = html.replace('</head>', `${analytics}</head>`);
}

fs.writeFileSync(file, html);
console.log('NEBC SEO Phase 1 build transformations applied.');
