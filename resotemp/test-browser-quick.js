const { chromium } = require('../node_modules/@playwright/test');

async function testQuick() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleErrors = [];
  const consoleWarns = [];
  const notFounds = [];

  page.on('response', res => {
    if (res.status() === 404) notFounds.push(res.url());
  });

  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'warning') consoleWarns.push(msg.text());
  });

  page.on('pageerror', err => {
    consoleErrors.push(err.message || String(err));
  });

  console.log('Testing http://localhost:4000/ ...');
  await page.goto('http://localhost:4000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  // Check Globe
  const canvas = await page.$('canvas.maplibregl-canvas');
  console.log('Globe Canvas found:', !!canvas);

  console.log('Console Errors:', consoleErrors);
  console.log('Console Warns (first 10):', consoleWarns.slice(0, 10));
  console.log('404 URLs:', [...new Set(notFounds)]);

  await browser.close();
}

testQuick().catch(console.error);
