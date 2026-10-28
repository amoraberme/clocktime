const { chromium } = require('../node_modules/@playwright/test');

const PAGES_TO_TEST = [
  '/',
  '/pricing',
  '/about',
  '/contact',
  '/features',
  '/features/revenue-attribution',
  '/features/realtime',
  '/features/visitor-profiles',
  '/features/funnels',
  '/features/performance',
  '/features/ai-assistant',
  '/features/mcp-server',
  '/for/startups',
  '/for/saas',
  '/for/ecommerce',
  '/vs/spreadsheets',
  '/vs/biometric-clocks',
  '/vs/foreign-apps',
  '/vs/legacy-payroll',
  '/vs/enterprise-hris',
  '/blog',
  '/docs',
  '/integrations',
  '/login',
  '/register'
];

async function runBrowserAudit() {
  console.log('Starting Playwright Full Browser Audit on http://localhost:4000/ ...\n');
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
  });

  let totalErrors = 0;

  for (const route of PAGES_TO_TEST) {
    const page = await context.newPage();
    const consoleErrors = [];
    const notFounds = [];

    page.on('response', res => {
      if (res.status() === 404) {
        notFounds.push(res.url());
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      consoleErrors.push(err.message || String(err));
    });

    try {
      const res = await page.goto(`http://localhost:4000${route}`, {
        waitUntil: 'domcontentloaded',
        timeout: 8000
      });

      // Wait a moment for React hydration & scripts
      await page.waitForTimeout(1000);

      // Check Globe canvas on homepage or realtime
      let globeFound = false;
      if (route === '/' || route === '/features/realtime') {
        const canvas = await page.$('canvas.maplibregl-canvas');
        if (canvas) {
          const box = await canvas.boundingBox();
          globeFound = !!box && box.width > 0 && box.height > 0;
        }
      }

      const status = res.status();
      const hasErrors = consoleErrors.length > 0 || notFounds.length > 0;

      if (hasErrors) {
        console.log(`❌ ${route} [${status}]:`);
        if (consoleErrors.length) console.log('   Console Errors:', consoleErrors);
        if (notFounds.length) console.log('   404 Resources:', notFounds);
        totalErrors += consoleErrors.length + notFounds.length;
      } else {
        const globeInfo = (route === '/' || route === '/features/realtime') ? ` [Globe: ${globeFound ? '✓ ACTIVE' : 'NONE'}]` : '';
        console.log(`✓ ${route} [${status}] OK${globeInfo}`);
      }
    } catch (e) {
      console.log(`❌ ${route} EXCEPTION:`, e.message);
      totalErrors++;
    } finally {
      await page.close();
    }
  }

  await browser.close();
  console.log(`\nBrowser Audit Finished. Total issues found: ${totalErrors}`);
}

runBrowserAudit().catch(console.error);
