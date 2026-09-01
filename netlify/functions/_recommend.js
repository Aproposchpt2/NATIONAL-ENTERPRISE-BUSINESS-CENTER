'use strict';
// Shared recommendation + REASON engine for the National Enterprise Business Center.
const SERVICE_LIBRARY = {
  business_plan: { label: 'Business Plan', icon: '📄', href: '#results', blurb: 'Your tailored business plan and operating roadmap.' },
  formation: { label: 'Business Formation Guidance', icon: '🏢', href: '#assistant', blurb: 'Entity setup, EIN guidance, licensing readiness, and startup checklist support.' },
  documents: { label: 'Business Documents', icon: '📑', href: '/documents.html', blurb: 'Generate practical business and funding-preparation documents.' },
  website: { label: 'Website Design Advisory', icon: '🌐', href: '/website-builder.html', blurb: 'Plan and build a professional customer-facing web presence.' },
  marketing: { label: 'Marketing Advisory', icon: '📣', href: '#assistant', blurb: 'Use Morgan’s Office for marketing-readiness guidance and next-step planning.' },
  federal_contracts: { label: 'Federal Contract Opportunities', icon: '🏛', href: 'https://federalcontractorportal.aproposgroupllc.com', blurb: 'Federal opportunity intelligence through the Registered Federal Contractors Portal.' },
  state_contracts: { label: 'State & Local Contract Opportunities', icon: '🏙', href: 'https://natcorp.aproposgroupllc.com', blurb: 'State and local opportunity intelligence through the National Corporate Contract Exchange.' },
  funding: { label: 'Business Funding Opportunity Center', icon: '💵', href: '/business-funding.html', blurb: 'Identify relevant controlled business-funding sources and review fit evidence, unresolved qualification questions, and next actions.' },
  proposal: { label: 'Proposal Readiness Guidance', icon: '📝', href: '#assistant', blurb: 'Use Morgan’s Office to review proposal readiness and determine the appropriate contract-response path.' },
  assistant: { label: 'Morgan’s Office', icon: '💬', href: '/morgans-office.html', blurb: 'Post-assessment advisory guidance is included automatically.' },
};
function arr(v){return Array.isArray(v)?v.map(x=>String(x||'').trim()).filter(Boolean):[]}
function recommend(input){
  const statuses=new Set(arr(input.businessStatus)),needs=new Set(arr(input.servicesNeeded));
  const stage=String(input.businessStageInput||input.businessStage||'not_sure').toLowerCase();
  const isStartup=statuses.has('startup')||['idea','starting','start'].includes(stage);
  const noBasics=isStartup||statuses.has('none');
  const wantsFederal=needs.has('federal_contracts');
  const wantsState=needs.has('state_contracts');
  const wantsContracts=wantsFederal||wantsState||needs.has('proposal')||stage==='contracts'||stage==='win contracts';
  const wantsWebsite=needs.has('website'),wantsEin=needs.has('ein'),wantsFunding=needs.has('funding');
  const missing=[];
  if(wantsEin||isStartup)missing.push('EIN');
  if(wantsWebsite)missing.push('Website');
  // Federal registration is relevant only when the member explicitly requested the federal path.
  if(wantsFederal&&!statuses.has('registered'))missing.push('Registered Federal Contractor');
  // State/local readiness is relevant only when that path is requested.
  if(wantsState&&!statuses.has('gov_regs'))missing.push('Licensed Corporation');
  const rec=[],seen=new Set(); const add=(key,reason)=>{if(seen.has(key)||!SERVICE_LIBRARY[key])return;seen.add(key);rec.push({key,reason})};
  add('business_plan','Every path starts from your tailored business plan.');
  if(noBasics||wantsEin){add('formation','Because you need the foundation organized before the next stage.');add('documents','Because early business records and documents need to be in place.');}
  if(wantsWebsite)add('website','Because you asked for help getting your website built.');
  if(wantsFunding)add('funding','Because you indicated that the business needs funding or capital and should evaluate relevant financing sources.');
  if(wantsFederal)add('federal_contracts','Because you explicitly requested federal contract opportunities.');
  if(wantsState)add('state_contracts','Because you explicitly requested state and local contract opportunities.');
  if(wantsContracts)add('proposal','Because contract leads become valuable when the business is ready to respond.');
  add('assistant','Because Morgan’s post-assessment interview is included automatically.');
  const recommendedServices=rec.slice(0,9).map(({key,reason})=>({key,...SERVICE_LIBRARY[key],reason}));
  let businessStage='BUILD'; if(noBasics)businessStage='START'; if(wantsContracts)businessStage='WIN CONTRACTS'; if(stage==='growing'||stage==='grow')businessStage='GROW';
  let pathStep='Use Morgan’s Office to turn this plan into a 7-day action list.';
  if(wantsState&&!wantsFederal)pathStep='Use NAT-CORP for supported state and local opportunities. Federal registration is not required unless you also choose the federal opportunity path.';
  else if(wantsFederal&&!wantsState)pathStep='Use the Registered Federal Contractors Portal for federal opportunities and complete any federal registration readiness gaps first.';
  else if(wantsFederal&&wantsState)pathStep='Use the Registered Federal Contractors Portal for federal opportunities and NAT-CORP for state and local opportunities.';
  else if(wantsFunding)pathStep='Use Morgan’s Office to review funding readiness, then open the Business Funding Opportunity Center when source analysis is appropriate.';
  const nextSteps=['Review and save your AI-generated business plan.',missing.length?`Start with the missing foundation item: ${missing[0]}.`:'Continue to Morgan’s Office for your post-assessment interview.',pathStep];
  return{businessStage,missingItems:missing.slice(0,8),recommendedServices,nextSteps};
}
module.exports={recommend,SERVICE_LIBRARY};
