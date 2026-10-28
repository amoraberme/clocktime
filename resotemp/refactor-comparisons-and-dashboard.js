const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, 'dist');

// Helper to do lossless string replacement in both static HTML and self.__next_f payloads
function safeReplaceInFile(filePath, replacements) {
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
    console.log(`Updated ${path.relative(DIST_DIR, filePath)}`);
  }
}

// 1. Refactor Hero Tabs in 3x45c76c5bhv9.js
console.log('--- Step 1: Refactoring Hero Tabs & Dashboard Preview in Chunks ---');
const chunk3x = path.join(DIST_DIR, '_next', 'static', 'chunks', '3x45c76c5bhv9.js');
safeReplaceInFile(chunk3x, [
  { from: '{id:"visitors",label:"Visitors"', to: '{id:"visitors",label:"Live Attendance"' },
  { from: '{id:"journey",label:"Journey"', to: '{id:"journey",label:"Cutoff DTR Sheet"' },
  { from: '{id:"funnels",label:"Funnels"', to: '{id:"funnels",label:"Shift Schedule"' },
  { from: '{id:"settings",label:"settings"', to: '{id:"settings",label:"DOLE & Tax Rules"' },
  { from: '{id:"realtime",label:"Realtime"', to: '{id:"realtime",label:"GPS & Geofences"' },
  { from: 'alt:"ClockTime Visitors preview"', to: 'alt:"ClockTime Live Attendance preview"' },
  { from: 'alt:"ClockTime Journey preview"', to: 'alt:"ClockTime Cutoff DTR Sheet preview"' },
  { from: 'alt:"ClockTime Funnels preview"', to: 'alt:"ClockTime Shift Schedule preview"' },
  { from: 'alt:"ClockTime Performance preview"', to: 'alt:"ClockTime DOLE & Tax Rules preview"' },
  { from: 'alt:"ClockTime Realtime preview"', to: 'alt:"ClockTime GPS & Geofences preview"' },
  // Also comparison table headers in 3x45c76c5bhv9.js
  { from: 'icon:"logos:google-analytics",className:"size-8"}),(0,t.jsx)("span",{children:"GA4"})', to: 'icon:"solar:document-text-bold-duotone",className:"size-8 text-emerald-500"}),(0,t.jsx)("span",{children:"Spreadsheets"})' },
  { from: 'icon:"selfhst:plausible",className:"size-8"}),(0,t.jsx)("span",{children:"Plausible"})', to: 'icon:"solar:scanner-bold-duotone",className:"size-8 text-blue-500"}),(0,t.jsx)("span",{children:"Biometrics"})' },
  { from: 'icon:"thesvg-color:fathom",className:"size-8"}),(0,t.jsx)("span",{children:"Fathom"})', to: 'icon:"solar:global-bold-duotone",className:"size-8 text-amber-500"}),(0,t.jsx)("span",{children:"Foreign Apps"})' },
  // Comparison table items in 3x45c76c5bhv9.js
  { from: '{name:"No cookie banner",icon:"ph:cookie-duotone",visitors:"check",ga:"cross",plausible:"check",fathom:"check"}', to: '{name:"DOLE Overtime & Holiday Premiums",icon:"solar:compass-bold-duotone",visitors:"check",ga:"cross",plausible:"cross",fathom:"cross"}' },
  { from: '{name:"Revenue attribution",icon:"solar:dollar-minimalistic-bold-duotone",visitors:"check",ga:"warning",plausible:"cross",fathom:"warning"}', to: '{name:"SSS, PhilHealth, Pag-IBIG & BIR 2316",icon:"solar:shield-check-bold-duotone",visitors:"check",ga:"cross",plausible:"cross",fathom:"cross"}' },
  { from: '{name:"Visitor journeys",icon:"solar:routing-2-bold-duotone",visitors:"check",ga:"warning",plausible:"cross",fathom:"cross"}', to: '{name:"GPS Geofencing & Anti-Spoofing",icon:"solar:map-point-bold-duotone",visitors:"check",ga:"cross",plausible:"cross",fathom:"warning"}' },
  { from: '{name:"User identification",icon:"solar:user-id-bold-duotone",visitors:"check",ga:"cross",plausible:"cross",fathom:"cross"}', to: '{name:"Shared Tablet Kiosk (PIN & QR)",icon:"solar:tablet-bold-duotone",visitors:"check",ga:"cross",plausible:"warning",fathom:"cross"}' },
  { from: '{name:"Experience Score",icon:"solar:star-fall-bold-duotone",visitors:"check",ga:"cross",plausible:"cross",fathom:"cross"}', to: '{name:"PayMongo (GCash & Maya) Billing",icon:"solar:card-2-bold-duotone",visitors:"check",ga:"cross",plausible:"cross",fathom:"cross"}' }
]);

// 2. Refactor Navbar Mega-Menu in 2jup3qi0kh53v.js
console.log('--- Step 2: Refactoring Comparisons Mega Menu in Navbar Chunk ---');
const chunk2j = path.join(DIST_DIR, '_next', 'static', 'chunks', '2jup3qi0kh53v.js');
safeReplaceInFile(chunk2j, [
  { from: '{name:"vs Google Analytics",href:"/vs/google-analytics"', to: '{name:"vs Manual Spreadsheets",href:"/vs/spreadsheets"' },
  { from: '{name:"vs Plausible",href:"/vs/plausible"', to: '{name:"vs Standalone Biometrics",href:"/vs/biometric-clocks"' },
  { from: '{name:"vs Fathom",href:"/vs/fathom"', to: '{name:"vs Foreign Apps",href:"/vs/foreign-apps"' },
  { from: '{name:"vs Mixpanel",href:"/vs/mixpanel"', to: '{name:"vs Legacy Desktop Payroll",href:"/vs/legacy-payroll"' },
  { from: '{name:"vs PostHog",href:"/vs/posthog"', to: '{name:"vs Complex Enterprise HRIS",href:"/vs/enterprise-hris"' },
  { from: '{title:"vs Google Analytics",description:"100% cookieless & 45x lighter than GA4",href:"/vs/google-analytics",icon:"logos:google-analytics"}', to: '{title:"vs Manual Spreadsheets",description:"Automated DOLE OT, PhilHealth & 0 formulas",href:"/vs/spreadsheets",icon:"solar:document-text-bold-duotone"}' },
  { from: '{title:"vs Plausible",description:"Revenue attribution & AI data assistant",href:"/vs/plausible",icon:"selfhst:plausible"}', to: '{title:"vs Standalone Biometrics",description:"No USB flash drives or proprietary cables",href:"/vs/biometric-clocks",icon:"solar:scanner-bold-duotone"}' },
  { from: '{title:"vs Fathom",description:"Funnels, realtime globe & event tracking",href:"/vs/fathom",icon:"thesvg-color:fathom"}', to: '{title:"vs Foreign Apps (Deputy / When I Work)",description:"Built for Philippine labor law & GCash/Maya",href:"/vs/foreign-apps",icon:"solar:global-bold-duotone"}' },
  { from: '{title:"vs Mixpanel",description:"Clean conversion funnels with zero MTU fees",href:"/vs/mixpanel",icon:"thesvg-color:mixpanel"}', to: '{title:"vs Legacy Desktop Payroll",description:"Modern cloud & mobile PWA without Windows locks",href:"/vs/legacy-payroll",icon:"solar:server-square-bold-duotone"}' },
  { from: '{title:"vs PostHog",description:"Lightweight analytics without client bloat",href:"/vs/posthog",icon:"thesvg-color:posthog"}', to: '{title:"vs Complex Enterprise HRIS",description:"Set up in 5 minutes with zero consulting fees",href:"/vs/enterprise-hris",icon:"solar:shield-star-bold-duotone"}' },
  { from: '{title:"Comparisons",description:"See how we compare vs GA4 & others",href:"/vs/google-analytics"', to: '{title:"Comparisons",description:"See how ClockTime compares vs spreadsheets & biometrics",href:"/vs/spreadsheets"' },
  { from: '{label:"Comparisons",href:"/vs/google-analytics"', to: '{label:"Comparisons",href:"/vs/spreadsheets"' }
]);

// 3. Update dist/index.html (Tabs & Comparison Table)
console.log('--- Step 3: Updating dist/index.html ---');
const indexHtml = path.join(DIST_DIR, 'index.html');
safeReplaceInFile(indexHtml, [
  // Hero tabs HTML
  { from: '</span><span>Visitors</span></button>', to: '</span><span>Live Attendance</span></button>' },
  { from: '</span><span>Journey</span></button>', to: '</span><span>Cutoff DTR Sheet</span></button>' },
  { from: '</span><span>Funnels</span></button>', to: '</span><span>Shift Schedule</span></button>' },
  { from: '</span><span>settings</span></button>', to: '</span><span>DOLE & Tax Rules</span></button>' },
  { from: '</span><span>Realtime</span></button>', to: '</span><span>GPS & Geofences</span></button>' },
  // Comparison table headers HTML
  { from: '<span>GA4</span></div></th>', to: '<span>Spreadsheets</span></div></th>' },
  { from: '<span>Plausible</span></div></th>', to: '<span>Biometrics</span></div></th>' },
  { from: '<span>Fathom</span></div></th>', to: '<span>Foreign Apps</span></div></th>' },
  // Comparison table headers in self.__next_f
  { from: '\"GA4\"', to: '\"Spreadsheets\"' },
  { from: '\"Plausible\"', to: '\"Biometrics\"' },
  { from: '\"Fathom\"', to: '\"Foreign Apps\"' },
  // Hero tabs in self.__next_f
  { from: '\"Visitors\"', to: '\"Live Attendance\"' },
  { from: '\"Journey\"', to: '\"Cutoff DTR Sheet\"' },
  { from: '\"Funnels\"', to: '\"Shift Schedule\"' },
  { from: '\"settings\"', to: '\"DOLE & Tax Rules\"' },
  { from: '\"Realtime\"', to: '\"GPS & Geofences\"' },
  // Mega menu links in HTML
  { from: 'vs Google Analytics', to: 'vs Manual Spreadsheets' },
  { from: 'vs Plausible', to: 'vs Standalone Biometrics' },
  { from: 'vs Fathom', to: 'vs Foreign Apps' },
  { from: 'vs Mixpanel', to: 'vs Legacy Desktop Payroll' },
  { from: 'vs PostHog', to: 'vs Complex Enterprise HRIS' },
  { from: '100% cookieless & 45x lighter than GA4', to: 'Automated DOLE OT, PhilHealth & 0 formulas' },
  { from: 'Revenue attribution & AI data assistant', to: 'No USB flash drives or proprietary cables' },
  { from: 'Funnels, realtime globe & event tracking', to: 'Built for Philippine labor law & GCash/Maya' },
  { from: 'Clean conversion funnels with zero MTU fees', to: 'Modern cloud & mobile PWA without Windows locks' },
  { from: 'Lightweight analytics without client bloat', to: 'Set up in 5 minutes with zero consulting fees' },
  { from: '/vs/google-analytics', to: '/vs/spreadsheets' },
  { from: '/vs/plausible', to: '/vs/biometric-clocks' },
  { from: '/vs/fathom', to: '/vs/foreign-apps' },
  { from: '/vs/mixpanel', to: '/vs/legacy-payroll' },
  { from: '/vs/posthog', to: '/vs/enterprise-hris' }
]);

// 4. Update all other HTML files (mega menu & links)
console.log('--- Step 4: Updating Navigation in all other HTML pages ---');
const allHtmlFiles = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.html'));
for (const file of allHtmlFiles) {
  if (file === 'index.html') continue;
  safeReplaceInFile(path.join(DIST_DIR, file), [
    { from: 'vs Google Analytics', to: 'vs Manual Spreadsheets' },
    { from: 'vs Plausible', to: 'vs Standalone Biometrics' },
    { from: 'vs Fathom', to: 'vs Foreign Apps' },
    { from: 'vs Mixpanel', to: 'vs Legacy Desktop Payroll' },
    { from: 'vs PostHog', to: 'vs Complex Enterprise HRIS' },
    { from: '100% cookieless & 45x lighter than GA4', to: 'Automated DOLE OT, PhilHealth & 0 formulas' },
    { from: 'Revenue attribution & AI data assistant', to: 'No USB flash drives or proprietary cables' },
    { from: 'Funnels, realtime globe & event tracking', to: 'Built for Philippine labor law & GCash/Maya' },
    { from: 'Clean conversion funnels with zero MTU fees', to: 'Modern cloud & mobile PWA without Windows locks' },
    { from: 'Lightweight analytics without client bloat', to: 'Set up in 5 minutes with zero consulting fees' },
    { from: '/vs/google-analytics', to: '/vs/spreadsheets' },
    { from: '/vs/plausible', to: '/vs/biometric-clocks' },
    { from: '/vs/fathom', to: '/vs/foreign-apps' },
    { from: '/vs/mixpanel', to: '/vs/legacy-payroll' },
    { from: '/vs/posthog', to: '/vs/enterprise-hris' }
  ]);
}

// 5. Refactor Comparison Pages in dist/vs/
console.log('--- Step 5: Refactoring Comparison Pages in dist/vs/ ---');

// 5A: dist/vs/google-analytics.html -> ClockTime vs Manual Spreadsheets
const vsGaPath = path.join(DIST_DIR, 'vs', 'google-analytics.html');
safeReplaceInFile(vsGaPath, [
  { from: 'ClockTime vs Google Analytics', to: 'ClockTime vs Manual Spreadsheets' },
  { from: 'The lightweight, revenue-attributed alternative to GA4.', to: 'The automated, DOLE-compliant alternative to manual Excel spreadsheets.' },
  { from: 'Skip the complicated GA4 dashboards, 14-month data caps, and required cookie popups. ClockTime delivers clean revenue attribution and instant insights in a dashboard you\'ll actually love using.', to: 'Eliminate error-prone Excel formulas, missing paper biometrics, and 3-day payroll cutoff scrambles. ClockTime calculates DOLE overtime, night diff, holiday premiums, and statutory deductions in seconds.' },
  { from: 'Why founders switch from Google Analytics to ClockTime', to: 'Why Philippine business owners switch from Excel spreadsheets to ClockTime' },
  { from: 'Engineered from the ground up for simplicity, instant insights, and total privacy compliance.', to: 'Engineered specifically for Philippine labor standards, multi-branch scheduling, and zero-headache DOLE compliance.' },
  { from: '100% GDPR &amp; CCPA Compliant', to: 'Zero Broken Formulas &amp; Manual Errors' },
  { from: 'No cookies, no IP logging, and no persistent tracking across websites. Zero legal liability and no annoying cookie banners required.', to: 'Spreadsheets are vulnerable to accidental formula overwrites and manual entry errors. ClockTime automatically calculates regular, overtime, and holiday hours with 100% mathematical accuracy.' },
  { from: '45x Lighter Script (&lt;1 KB)', to: 'Automated DOLE Labor Code Multipliers' },
  { from: 'Google Analytics adds 45KB+ of bloat to your site. ClockTime runs under 1KB, ensuring pristine Core Web Vitals and lightning-fast load times.', to: 'ClockTime enforces Rule II Book III rules: 125% regular overtime, 130% rest day & special holiday pay, 200% regular holiday pay, and 10% night differential automatically.' },
  { from: 'Direct Philippine Payroll & DOLE Compliance', to: 'Pre-Loaded 2026 SSS, PhilHealth &amp; Pag-IBIG' },
  { from: 'Connect your Stripe or payment gateways directly to track exact MRR, LTV, and churn per marketing campaign without convoluted event tagging.', to: 'Never search for updated contribution brackets again. The latest 2026 SSS employee/employer split, PhilHealth 5% rate, and Pag-IBIG ₱200 cap are automatically applied.' },
  { from: 'Clean, Human-Readable UI', to: 'Tamper-Evident GPS &amp; Kiosk Verification' },
  { from: 'Say goodbye to complex GA4 exploration reports and nested configuration menus. View all your essential metrics on a unified, high-contrast dashboard.', to: 'Paper logbooks and manual sheets invite buddy punching. ClockTime captures GPS geofenced coordinates and optional selfie verification for every clock-in.' },
  { from: 'Google Analytics vs ClockTime FAQs', to: 'Spreadsheets vs ClockTime FAQs' },
  { from: 'Frequently asked questions when migrating from Google Analytics to ClockTime.', to: 'Frequently asked questions when migrating from Excel spreadsheets and paper DTR to ClockTime.' },
  { from: 'Can I run ClockTime alongside Google Analytics?', to: 'Can I export attendance and payroll data to Excel or CSV?' },
  { from: 'Yes! You can install both scripts simultaneously during a trial or migration period. ClockTime will not conflict with GA4 or any existing tag managers.', to: 'Yes! You can export official DOLE Form 1 DTRs, employee summary logs, and bank-ready payroll disbursement files in Excel (.xlsx) and CSV formats anytime.' },
  { from: 'Do I need a cookie consent banner when using ClockTime?', to: 'How does ClockTime calculate Philippine statutory deductions?' },
  { from: 'How difficult is it to migrate from Google Analytics?', to: 'How easy is it to import our existing employee roster?' }
]);

// 5B: dist/vs/plausible.html -> ClockTime vs Standalone Biometric Clocks
const vsPlausiblePath = path.join(DIST_DIR, 'vs', 'plausible.html');
safeReplaceInFile(vsPlausiblePath, [
  { from: 'ClockTime vs Plausible', to: 'ClockTime vs Standalone Biometric Clocks' },
  { from: 'Plausible simplicity with native revenue attribution.', to: 'The modern cloud alternative to standalone USB biometric machines.' },
  { from: 'Skip the expensive biometric hardware, messy USB flash drive exports, and outdated Windows desktop software. ClockTime gives your business instant cloud attendance and automated DOLE payroll.', to: 'Skip the expensive biometric hardware, messy USB flash drive exports, and outdated Windows desktop software. ClockTime gives your business instant cloud attendance and automated DOLE payroll.' },
  { from: 'Why founders switch from Plausible to ClockTime', to: 'Why Philippine businesses replace standalone biometric clocks with ClockTime' },
  { from: 'ClockTime vs Plausible: Built for high-growth modern products', to: 'ClockTime vs Standalone Biometrics: Built for multi-branch operations' },
  { from: 'Plausible Analytics vs ClockTime FAQs', to: 'Biometric Clocks vs ClockTime FAQs' },
  { from: 'Frequently asked questions when migrating from Plausible to ClockTime.', to: 'Frequently asked questions when replacing biometric hardware with ClockTime.' }
]);

// 5C: dist/vs/fathom.html -> ClockTime vs Foreign Scheduling Apps
const vsFathomPath = path.join(DIST_DIR, 'vs', 'fathom.html');
safeReplaceInFile(vsFathomPath, [
  { from: 'ClockTime vs Fathom', to: 'ClockTime vs Foreign Scheduling Apps (Deputy / When I Work)' },
  { from: 'Privacy analytics built for monetized SaaS &amp; ecommerce.', to: 'Built specifically for Philippine labor standards, unlike foreign US/UK time apps.' },
  { from: 'The smarter alternative to Fathom Analytics', to: 'Why Philippine teams choose ClockTime over foreign scheduling tools' },
  { from: 'Fathom Analytics vs ClockTime FAQs', to: 'Foreign Apps vs ClockTime FAQs' },
  { from: 'Frequently asked questions when migrating from Fathom to ClockTime.', to: 'Frequently asked questions when choosing ClockTime over US/foreign scheduling apps.' }
]);

// 5D: dist/vs/mixpanel.html -> ClockTime vs Legacy Desktop Payroll
const vsMixpanelPath = path.join(DIST_DIR, 'vs', 'mixpanel.html');
safeReplaceInFile(vsMixpanelPath, [
  { from: 'ClockTime vs Mixpanel', to: 'ClockTime vs Legacy Desktop Payroll Software' },
  { from: 'Funnel precision without enterprise pricing or setup fatigue.', to: 'The lightweight cloud alternative to outdated on-premise Windows payroll.' },
  { from: 'Why teams prefer ClockTime over complex event trackers', to: 'Why growing companies replace legacy desktop payroll with ClockTime' },
  { from: 'Mixpanel vs ClockTime FAQs', to: 'Legacy Payroll vs ClockTime FAQs' },
  { from: 'Frequently asked questions when migrating from Mixpanel to ClockTime.', to: 'Frequently asked questions when upgrading from desktop software to ClockTime.' }
]);

// 5E: dist/vs/posthog.html -> ClockTime vs Complex Enterprise HRIS
const vsPosthogPath = path.join(DIST_DIR, 'vs', 'posthog.html');
safeReplaceInFile(vsPosthogPath, [
  { from: 'ClockTime vs PostHog', to: 'ClockTime vs Complex Enterprise HRIS' },
  { from: 'Fast, focused analytics without the overwhelming product bloat.', to: 'Everything you need for Philippine time clock & payroll. Nothing you don\'t.' },
  { from: 'Simple, ultra-fast analytics without client performance drag', to: 'Zero 6-month consulting setups, zero bloat, and 100% operational focus' },
  { from: 'PostHog vs ClockTime FAQs', to: 'Enterprise HRIS vs ClockTime FAQs' },
  { from: 'Frequently asked questions when migrating from PostHog to ClockTime.', to: 'Frequently asked questions when choosing ClockTime over complex HRIS suites.' }
]);

// Create canonical copy files for semantic paths in dist/vs/
console.log('--- Step 6: Creating semantic route files in dist/vs/ ---');
fs.copyFileSync(path.join(DIST_DIR, 'vs', 'google-analytics.html'), path.join(DIST_DIR, 'vs', 'spreadsheets.html'));
fs.copyFileSync(path.join(DIST_DIR, 'vs', 'plausible.html'), path.join(DIST_DIR, 'vs', 'biometric-clocks.html'));
fs.copyFileSync(path.join(DIST_DIR, 'vs', 'fathom.html'), path.join(DIST_DIR, 'vs', 'foreign-apps.html'));
fs.copyFileSync(path.join(DIST_DIR, 'vs', 'mixpanel.html'), path.join(DIST_DIR, 'vs', 'legacy-payroll.html'));
fs.copyFileSync(path.join(DIST_DIR, 'vs', 'posthog.html'), path.join(DIST_DIR, 'vs', 'enterprise-hris.html'));
console.log('Created dist/vs/spreadsheets.html, biometric-clocks.html, foreign-apps.html, legacy-payroll.html, enterprise-hris.html');

// 6. Update server.js to support semantic route aliases
console.log('--- Step 7: Updating server.js route aliases ---');
const serverJsPath = path.resolve(__dirname, 'server.js');
let serverJs = fs.readFileSync(serverJsPath, 'utf8');
if (!serverJs.includes('/vs/spreadsheets')) {
  serverJs = serverJs.replace(
    '// Custom clean routes mapping (if needed in future)',
    `// Semantic comparison routes
    const vsAliases = {
      '/vs/spreadsheets': '/vs/spreadsheets.html',
      '/vs/biometric-clocks': '/vs/biometric-clocks.html',
      '/vs/foreign-apps': '/vs/foreign-apps.html',
      '/vs/legacy-payroll': '/vs/legacy-payroll.html',
      '/vs/enterprise-hris': '/vs/enterprise-hris.html',
      '/vs/google-analytics': '/vs/spreadsheets.html',
      '/vs/plausible': '/vs/biometric-clocks.html',
      '/vs/fathom': '/vs/foreign-apps.html',
      '/vs/mixpanel': '/vs/legacy-payroll.html',
      '/vs/posthog': '/vs/enterprise-hris.html',
    };
    if (vsAliases[cleanPath]) {
      cleanPath = vsAliases[cleanPath];
    }
    // Custom clean routes mapping (if needed in future)`
  );
  fs.writeFileSync(serverJsPath, serverJs, 'utf8');
  console.log('Updated server.js with semantic /vs/ route aliases');
}

console.log('--- REFACTORING COMPLETE ---');
