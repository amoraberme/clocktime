const fs = require('fs');
const path = require('path');

const DIST_DIR = path.resolve(__dirname, 'dist');

function getAllFiles(dir, extensions = ['.html', '.js']) {
  let results = [];
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of list) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(getAllFiles(fullPath, extensions));
    } else if (extensions.some(ext => file.name.endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

const allFiles = getAllFiles(DIST_DIR);
console.log(`Auditing and updating ${allFiles.length} files in dist/ ...`);

// Universal replacements dictionary
const REPLACEMENTS = [
  // Brand & Domain
  { from: '@elevenanalytics', to: '@clocktimeph' },
  { from: 'elevenanalytics.io', to: 'clocktime.ph' },
  { from: 'Eleven Analytics', to: 'ClockTime' },
  { from: 'Eleven analytics', to: 'ClockTime' },
  { from: 'Eleven Technologies Inc.', to: 'ClockTime Technologies Inc.' },
  { from: 'support@elevenanalytics.io', to: 'support@clocktime.ph' },
  { from: 'privacy@elevenanalytics.io', to: 'privacy@clocktime.ph' },
  { from: 'Log in to Eleven', to: 'Log in to ClockTime' },
  { from: 'Log in to Eleven | Eleven', to: 'Log in to ClockTime | ClockTime' },
  { from: 'Reset Your Password | Eleven', to: 'Reset Your Password | ClockTime' },
  { from: 'Start Free 14-Day Trial | Eleven', to: 'Start Free 14-Day Trial | ClockTime' },
  { from: 'About Us - Our Mission & Principles | Eleven', to: 'About Us - Our Mission & Principles | ClockTime' },
  { from: 'Contact & Engineering Support | Eleven', to: 'Contact & Operations Support | ClockTime' },
  { from: 'Simple, Predictable Pricing | Eleven', to: 'Simple, Transparent Philippine Pricing | ClockTime' },
  { from: 'Terms of Service | Eleven', to: 'Terms of Service | ClockTime' },
  { from: 'Privacy Policy & GDPR Commitment | Eleven', to: 'Privacy Policy & Data Privacy Act (DPA) | ClockTime' },
  { from: 'Data Processing Agreement (DPA) | Eleven', to: 'Data Processing Agreement (RA 10173 DPA) | ClockTime' },

  // Navigation Menus & Features
  { from: 'Model Context Protocol (MCP) Server', to: 'ZKTeco & Biometrics Hardware Sync' },
  { from: 'MCP Server', to: 'Biometrics Hardware Sync' },
  { from: 'Model Context Protocol', to: 'Biometrics Integration' },
  { from: 'Core Web Vitals & Site Performance', to: 'Punctuality & Shift Adherence Analytics' },
  { from: 'Core Web Vitals', to: 'Shift Adherence Metrics' },
  { from: 'Core web vitals', to: 'Shift adherence metrics' },
  { from: 'visitor profiles', to: 'employee attendance profiles' },
  { from: 'Visitor Profiles', to: 'Employee Attendance Profiles' },
  { from: 'Visitor profiles', to: 'Employee attendance profiles' },
  { from: 'visitor journeys', to: 'employee cutoff DTR logs' },
  { from: 'Visitor journeys', to: 'Employee Cutoff DTR Logs' },
  { from: 'Visitor Journeys', to: 'Employee Cutoff DTR Logs' },
  { from: 'conversion funnels', to: 'shift roster scheduling' },
  { from: 'Conversion funnels', to: 'Shift roster scheduling' },
  { from: 'Conversion Funnels', to: 'Shift Roster Scheduling' },
  { from: 'bounce rate', to: 'tardiness rate' },
  { from: 'Bounce rate', to: 'Tardiness rate' },
  { from: 'Bounce Rate', to: 'Tardiness Rate' },
  { from: 'pageviews', to: 'time clock punches' },
  { from: 'Pageviews', to: 'Time Clock Punches' },

  // Solutions ("For")
  { from: 'Analytics for Startups', to: 'Time & Attendance for Retail & Franchises' },
  { from: 'Analytics for SaaS Businesses', to: 'Time Clock & Roster for BPO & Clinics' },
  { from: 'Analytics for E-Commerce Stores', to: 'Time Tracking for Restaurants & F&B' },
  { from: 'Analytics for Agencies & Marketers', to: 'Field Attendance for Construction & Logistics' },
  { from: 'Analytics for Creators & Bloggers', to: 'Attendance for Healthcare & Clinics' },
  { from: 'Analytics for Indie Hackers & Solopreneurs', to: 'Multi-Branch Shift Scheduling for Franchises' },

  // Blog Titles
  { from: 'How to Track True Revenue Attribution for SaaS Products', to: 'How to Automate Philippine DOLE Overtime & Holiday Payroll' },
  { from: 'How to Track True Revenue Attribution fo', to: 'Automate Philippine DOLE Overtime & Holiday' },
  { from: 'The Death of Cookie Banners: Why Cookieless Analytics Is Winning', to: 'Why Philippine Businesses Are Switching from Biometrics to GPS Clocks' },
  { from: 'The Death of Cookie Banners: Why Cookiel', to: 'Switching from Biometric Hardware to GPS' },
  { from: 'A Practical Guide to Optimizing SaaS Conversion Funnels', to: 'The 2026 Guide to Philippine Statutory Deductions (SSS, PhilHealth, Pag-IBIG)' },
  { from: 'A Practical Guide to Optimizing SaaS Con', to: 'The 2026 Guide to Philippine Statutory Deductions' },

  // Comparisons in all HTML/Chunks
  { from: 'Eleven vs Google Analytics', to: 'ClockTime vs Manual Spreadsheets' },
  { from: 'Eleven vs Plausible Analytics', to: 'ClockTime vs Standalone Biometric Clocks' },
  { from: 'Eleven vs Fathom Analytics', to: 'ClockTime vs Foreign Scheduling Apps' },
  { from: 'Eleven vs Mixpanel', to: 'ClockTime vs Legacy Desktop Payroll' },
  { from: 'Eleven vs PostHog', to: 'ClockTime vs Complex Enterprise HRIS' },
  { from: 'Eleven vs GA4', to: 'ClockTime vs Manual Spreadsheets' },
  { from: 'Eleven vs', to: 'ClockTime vs' },
  { from: 'Made by Nextjsshop', to: 'Crafted for Philippine Businesses' },
  { from: 'https://nextjsshop.com/templates/Eleven-Analytics', to: 'https://clocktime.ph' },
  { from: 'https://nextjsshop.com/images/logo.svg', to: '/logo.svg' }
];

let updatedCount = 0;
for (const file of allFiles) {
  let content = fs.readFileSync(file, 'utf8');
  let changed = false;

  for (const { from, to } of REPLACEMENTS) {
    if (content.includes(from)) {
      content = content.replaceAll(from, to);
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content, 'utf8');
    updatedCount++;
    console.log(`Updated: ${path.relative(DIST_DIR, file)}`);
  }
}

console.log(`\nSuccessfully audited and updated ${updatedCount} files.`);
