const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, 'dist');

function safeReplace(filePath, replacements) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const { from, to } of replacements) {
    if (content.includes(from)) {
      content = content.replaceAll(from, to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated: ${path.relative(DIST_DIR, filePath)}`);
  }
}

console.log('--- Step 1: Refactoring about.html & contact.html ---');
safeReplace(path.join(DIST_DIR, 'about.html'), [
  { from: '<span class="block">Web analytics reimagined.</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">Privacy-first. Revenue-focused.</span>',
    to: '<span class="block">Philippine time clock & payroll.</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">Built for Filipino teams.</span>' },
  { from: 'We started ClockTime with a single conviction: modern founders, developers, and marketing teams deserve pristine insights into what drives paying customers without invading user privacy or slowing down the web with heavy scripts.',
    to: 'We built ClockTime with a single conviction: Philippine business owners, HR managers, and team leaders shouldn\'t lose their weekends to Excel formulas, messy biometric USB sticks, and manual DOLE overtime calculations.' },
  { from: 'Our core philosophy centers on transparency, data minimalism, and actionable metrics over vanity pageviews.',
    to: 'Our core philosophy centers on reliability, DOLE Labor Code precision, and empowering Philippine operations with intuitive mobile and kiosk time tracking.' },
  { from: 'Built by engineers obsessed with web performance',
    to: 'Built by Filipino engineers for modern local operations' },
  { from: 'Privacy is non-negotiable',
    to: '100% Philippine Labor Code Compliance' },
  { from: 'Revenue is the only metric that matters',
    to: 'Accurate semi-monthly payroll in 1 click' },
  { from: 'Simplicity beats complexity',
    to: 'Works seamlessly on any tablet, mobile, or desktop' }
]);

safeReplace(path.join(DIST_DIR, 'contact.html'), [
  { from: '<h1 class="heading-hero">Get in touch with our engineering team</h1>',
    to: '<h1 class="heading-hero">Get in touch with our team in Manila</h1>' },
  { from: 'Need enterprise volume discounts, custom DPA agreements, or migration assistance from GA4? Send us a message.',
    to: 'Need multi-branch enterprise setup, hardware biometric sync, custom bank disbursement exports, or DOLE compliance guidance? Send us a message.' },
  { from: 'Engineering Support', to: 'Operations & DOLE Support' },
  { from: 'Enterprise Sales', to: 'Branch & Enterprise Solutions' }
]);

console.log('--- Step 2: Refactoring Features Subpages ---');
safeReplace(path.join(DIST_DIR, 'features', 'ai-assistant.html'), [
  { from: '<span class="block">Query your metrics</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">in natural everyday language</span>',
    to: '<span class="block">Ask attendance & overtime questions</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">in natural everyday Filipino & English</span>' },
  { from: 'Query your analytics in plain English. Get instant revenue insights, anomaly detection, conversion suggestions, and automated weekly summaries.',
    to: 'Ask questions in plain English or Taglish. Get instant answers about who is late, pending cutoff hours, DOLE overtime projections, and payroll summaries.' }
]);

safeReplace(path.join(DIST_DIR, 'features', 'funnels.html'), [
  { from: '<span class="block">Spot conversion drop-offs</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">and fix leaky funnels instantly</span>',
    to: '<span class="block">Drag-and-drop shift scheduling</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">with built-in DOLE rest day rules</span>' },
  { from: 'Build multi-step onboarding, checkout, and signup funnels in seconds. Discover where users abandon and optimize your conversion rates.',
    to: 'Build weekly rosters for retail branches, clinics, and call centers in minutes. Prevent 24-hour rest day violations and notify staff via mobile alerts.' }
]);

safeReplace(path.join(DIST_DIR, 'features', 'mcp-server.html'), [
  { from: '<span class="block">Bring live analytics context</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">directly into your AI IDE</span>',
    to: '<span class="block">Sync existing biometric clocks</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">directly to cloud DOLE payroll</span>' },
  { from: 'Query live active visitors, customer journeys, MRR breakdowns, and attribution funnels directly inside Cursor, Claude Desktop, Windsurf, or Zed via standard ZKTeco Biometric Terminals.',
    to: 'Connect physical ZKTeco thumbprint terminals, facial recognition turnstiles, and developer webhooks seamlessly with ClockTime\'s real-time cloud attendance engine.' }
]);

safeReplace(path.join(DIST_DIR, 'features', 'performance.html'), [
  { from: '<span class="block">Monitor real-user performance</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">and Shift Adherence Metrics</span>',
    to: '<span class="block">Real-time punctuality analytics</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">and shift adherence monitoring</span>' },
  { from: 'Track LCP, FID, CLS, INP, and page load speeds measured from real visitors across real devices and networks worldwide.',
    to: 'Track on-time arrivals, grace period adherence, tardiness minutes, undertime, and unexcused absences across all your branches in real time.' }
]);

safeReplace(path.join(DIST_DIR, 'features', 'realtime.html'), [
  { from: '<span class="block">Watch global user journeys</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">unfold live on your screen</span>',
    to: '<span class="block">Watch multi-branch clock-ins</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">unfold live with GPS geofence radar</span>' },
  { from: 'Monitor concurrent sessions, geographical traffic surges, and conversion events with sub-second latency and zero data sampling.',
    to: 'Monitor active staff, geofenced clock-in radii, kiosk status, and remote field teams across Metro Manila, Cebu, and Davao in real time.' }
]);

safeReplace(path.join(DIST_DIR, 'features', 'revenue-attribution.html'), [
  { from: '<span class="block">Connect every sale to its</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">exact traffic source</span>',
    to: '<span class="block">Automated DOLE payroll engine</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">with 1-click cutoff disbursements</span>' },
  { from: 'Understand which marketing channels, ad campaigns, and referrers generate real paying customers with zero third-party cookie tracking.',
    to: 'Turn verified attendance into semi-monthly payroll in seconds. Automatically calculate regular OT (125%), night diff (10%), holiday premiums (130%/200%), and SSS/PhilHealth/Pag-IBIG tables.' }
]);

safeReplace(path.join(DIST_DIR, 'features', 'visitor-profiles.html'), [
  { from: '<span class="block">Follow visitor sessions and</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">individual journey paths</span>',
    to: '<span class="block">Employee DTR records and</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">tamper-evident audit trails</span>' },
  { from: 'Understand how individual visitors discover your product, which pages they browse, and what triggers them to upgrade or drop off.',
    to: 'Complete Daily Time Record history for every employee with GPS map pins, kiosk selfie photo proof, manager approval logs, and official DOLE Form 1 PDF exports.' }
]);

console.log('--- Step 3: Refactoring Solutions (for/*.html) Subpages ---');
safeReplace(path.join(DIST_DIR, 'for', 'startups.html'), [
  { from: '<span class="block">Website analytics built for</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">fast-moving startups</span>',
    to: '<span class="block">Time clock & shift scheduling</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for retail stores & franchises</span>' },
  { from: 'Skip bloated analytics tools and confusing setups. Track your early traction, referral channels, and signups with a 2-minute cookieless install.',
    to: 'Manage store staff, opening/closing shifts, and multi-mall branch attendance across SM, Ayala, and Robinsons malls without paper sign-in sheets.' }
]);

safeReplace(path.join(DIST_DIR, 'for', 'saas.html'), [
  { from: '<span class="block">Revenue &amp; funnel analytics</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">engineered for SaaS</span>',
    to: '<span class="block">24/7 graveyard shift scheduling</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for BPO & customer support hubs</span>' },
  { from: 'Connect your landing page, app signup flow, and billing platform. Track customer acquisition costs and MRR attribution without complex BI tools.',
    to: 'Automate 10% night shift differential (10 PM – 6 AM), rotating roster coverage, overtime pre-approvals, and accurate semi-monthly payroll for hundreds of agents.' }
]);

safeReplace(path.join(DIST_DIR, 'for', 'ecommerce.html'), [
  { from: '<span class="block">Actionable revenue tracking</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for modern e-commerce</span>',
    to: '<span class="block">Fast tablet kiosk clock-in</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for restaurants, cafes & bars</span>' },
  { from: 'Identify which ad campaigns, influencers, and organic referrals drive real purchases. Track add-to-cart rates and checkout funnels with zero sampling.',
    to: 'Equip kitchen, counter, and dining service staff with a durable tablet kiosk. Prevent buddy punching with quick PINs and selfie verification during rush hours.' }
]);

safeReplace(path.join(DIST_DIR, 'for', 'agencies.html'), [
  { from: '<span class="block">Effortless client reporting</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for digital agencies</span>',
    to: '<span class="block">GPS geofence time tracking</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for job sites & field services</span>' },
  { from: 'Manage multiple client projects under one roof. Provide clients with beautiful, privacy-compliant dashboards they will actually understand.',
    to: 'Set 50m geofence perimeters around construction sites, client offices, and project locations. Prevent punch spoofing and track field technician arrival times.' }
]);

safeReplace(path.join(DIST_DIR, 'for', 'creators.html'), [
  { from: '<span class="block">Lightweight analytics for</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">creators and bloggers</span>',
    to: '<span class="block">Shift roster & DTR tracking</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for clinics, diagnostics & dental</span>' },
  { from: 'See which articles go viral, where your readers come from, and how your newsletter grows without slowing down your site or annoying readers.',
    to: 'Organize doctors, nurses, pharmacists, and medical technicians across multiple clinic branches with automated DOLE holiday premium calculations.' }
]);

safeReplace(path.join(DIST_DIR, 'for', 'indie-hackers.html'), [
  { from: '<span class="block">One analytics tool for all</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">your micro-SaaS projects</span>',
    to: '<span class="block">High-volume worker attendance</span><span class="block text-[#2563EB] dark:text-[#60A5FA]">for warehouses & manufacturing</span>' },
  { from: 'Manage unlimited side projects and micro-SaaS tools in a single unified dashboard. Track revenue, signups, and Product Hunt launches effortlessly.',
    to: 'Handle morning shift rush with sub-second kiosk clocking, offline punch caching during network cuts, and 1-click bank payroll disbursement.' }
]);

console.log('--- Step 4: Refactoring Blog Pages ---');
safeReplace(path.join(DIST_DIR, 'blog', 'how-to-track-revenue-attribution.html'), [
  { from: '<h1 class="heading-hero w-full py-2">How to Track True Revenue Attribution for SaaS Products</h1>',
    to: '<h1 class="heading-hero w-full py-2">How to Automate Philippine DOLE Overtime & Holiday Payroll</h1>' },
  { from: '<p class="subtitle-section mt-3 w-full max-w-2xl">Learn how to connect payment platforms directly to your analytics for precise multi-touch attribution without third-party cookies.</p>',
    to: '<p class="subtitle-section mt-3 w-full max-w-2xl">A complete practical guide to calculating Rule II Book III regular overtime (125%), night shift differential (10%), and holiday pay without manual spreadsheet formulas.</p>' }
]);

safeReplace(path.join(DIST_DIR, 'blog', 'cookieless-analytics-and-gdpr-compliance.html'), [
  { from: '<h1 class="heading-hero w-full py-2">The Death of Cookie Banners: Why Cookieless Analytics Is Winning</h1>',
    to: '<h1 class="heading-hero w-full py-2">Why Philippine Businesses Are Switching from Biometric Machines to GPS Time Clocks</h1>' },
  { from: '<p class="subtitle-section mt-3 w-full max-w-2xl">How privacy regulations and user fatigue are driving the shift away from intrusive tracking cookies toward privacy-first measurement.</p>',
    to: '<p class="subtitle-section mt-3 w-full max-w-2xl">Say goodbye to USB flash drive exports, faulty optical fingerprint scanners, and manual DTR tallying. Here is why cloud GPS and tablet kiosks are replacing legacy hardware.</p>' }
]);

safeReplace(path.join(DIST_DIR, 'blog', 'optimizing-conversion-funnels-in-saas.html'), [
  { from: '<h1 class="heading-hero w-full py-2">A Practical Guide to Optimizing SaaS Conversion Funnels</h1>',
    to: '<h1 class="heading-hero w-full py-2">The 2026 Guide to Philippine Statutory Deductions (SSS, PhilHealth, Pag-IBIG)</h1>' },
  { from: '<p class="subtitle-section mt-3 w-full max-w-2xl">Discover actionable strategies for identifying user drop-offs, improving onboarding completion, and boosting overall product conversion rates.</p>',
    to: '<p class="subtitle-section mt-3 w-full max-w-2xl">Everything you need to know about the 14% SSS contribution schedule, the 5% PhilHealth statutory rate, and the mandatory Pag-IBIG ₱200 cap under Philippine labor law.</p>' }
]);

console.log('--- Step 5: Refactoring Navbar Dropdowns in 2jup3qi0kh53v.js ---');
const chunk2jPath = path.join(DIST_DIR, '_next', 'static', 'chunks', '2jup3qi0kh53v.js');
safeReplace(chunk2jPath, [
  // Solutions
  { from: '{title:"Startups",description:"Fast, cookieless insights for early teams",href:"/for/startups"',
    to: '{title:"Retail & Franchises",description:"Multi-branch time clock & mall store scheduling",href:"/for/startups"' },
  { from: '{title:"SaaS",description:"Connect MRR and product signups effortlessly",href:"/for/saas"',
    to: '{title:"BPO & Call Centers",description:"24/7 rotating shifts & 10% night differential",href:"/for/saas"' },
  { from: '{title:"E-Commerce",description:"Track marketing campaigns and purchase funnels",href:"/for/ecommerce"',
    to: '{title:"Restaurants & F&B",description:"Tablet kiosk with photo proof for rush hours",href:"/for/ecommerce"' },
  { from: '{title:"Agencies",description:"Manage multi-client reporting from one dashboard",href:"/for/agencies"',
    to: '{title:"Construction & Logistics",description:"GPS geofence time tracking for field sites",href:"/for/agencies"' },
  { from: '{title:"Creators",description:"Lightweight tracking for newsletters and blogs",href:"/for/creators"',
    to: '{title:"Clinics & Healthcare",description:"Doctor & nurse rosters with holiday premiums",href:"/for/creators"' },
  { from: '{title:"Indie Hackers",description:"One analytics tool across all your side projects",href:"/for/indie-hackers"',
    to: '{title:"Warehouses & Factories",description:"High-volume sub-second shift attendance",href:"/for/indie-hackers"' },

  // Features
  { from: '{title:"Revenue Attribution",description:"Direct Stripe & payment revenue tracking",href:"/features/revenue-attribution"',
    to: '{title:"DOLE Statutory Payroll",description:"1-click overtime, night diff & tax calculations",href:"/features/revenue-attribution"' },
  { from: '{title:"Realtime 3D Globe",description:"Live geographic visitor traffic exploration",href:"/features/realtime"',
    to: '{title:"Multi-Branch Radar & GPS",description:"Live geofenced attendance across all locations",href:"/features/realtime"' },
  { from: '{title:"Visitor Profiles",description:"End-to-end customer journey tracking",href:"/features/visitor-profiles"',
    to: '{title:"Employee DTR & Audit Logs",description:"Complete DOLE Form 1 attendance trail & selfies",href:"/features/visitor-profiles"' },
  { from: '{title:"Conversion Funnels",description:"Multi-step drop-off and flow analysis",href:"/features/funnels"',
    to: '{title:"Visual Shift Scheduling",description:"Drag-and-drop weekly rosters & DOLE rest checks",href:"/features/funnels"' },
  { from: '{title:"Core Web Vitals",description:"Site speed and real-user performance metrics",href:"/features/performance"',
    to: '{title:"Punctuality & Exceptions",description:"Real-time tardiness, undertime & absence inbox",href:"/features/performance"' },
  { from: '{title:"AI Analytics Assistant",description:"Plain-English questions and automated insights",href:"/features/ai-assistant"',
    to: '{title:"AI Scheduling Assistant",description:"Instant Taglish & English roster assistance",href:"/features/ai-assistant"' },
  { from: '{title:"MCP Server",description:"Live analytics context in Cursor and Claude",href:"/features/mcp-server"',
    to: '{title:"ZKTeco Biometrics Sync",description:"Hardware thumbprint clock & API integration",href:"/features/mcp-server"' }
]);

console.log('--- REFACTORING COMPLETE ---');
