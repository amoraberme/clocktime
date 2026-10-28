/**
 * Automated Test Suite for server.js and dist/ archive
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3888;
process.env.PORT = PORT;

// Start server child process or require
const { spawn } = require('child_process');

async function runTests() {
  console.log('Testing server.js...');
  const serverProc = spawn('node', ['server.js', String(PORT)], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProc.stdout.on('data', (d) => process.stdout.write(`[Server] ${d}`));
  serverProc.stderr.on('data', (d) => process.stderr.write(`[Server Error] ${d}`));

  // Wait for server to start
  await new Promise((resolve) => setTimeout(resolve, 1500));

  function request(urlPath, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: PORT,
          path: urlPath,
          method: 'GET',
          headers
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              body: data
            });
          });
        }
      );
      req.on('error', reject);
      req.end();
    });
  }

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✓ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ✗ FAIL: ${message}`);
      failed++;
    }
  }

  try {
    // 1. Root route /
    const rootRes = await request('/');
    assert(rootRes.statusCode === 200, 'Root route / returns 200 OK');
    assert(rootRes.headers['content-type'].includes('text/html'), 'Root returns text/html');
    assert(rootRes.body.includes('ClockTime: Time clock'), 'Root contains ClockTime content');
    assert(rootRes.body.includes('Live Attendance'), 'Root contains refactored Live Attendance tab');
    assert(rootRes.body.includes('Spreadsheets'), 'Root contains refactored Spreadsheets comparison header');
    assert(rootRes.body.includes('__local_live_reload'), 'Root contains injected live reload script');
    assert(rootRes.body.includes('__offline_form_mock'), 'Root contains injected offline form mock');

    // 2. Clean URL /pricing
    const pricingRes = await request('/pricing');
    assert(pricingRes.statusCode === 200, 'Clean URL /pricing returns 200 OK');
    assert(pricingRes.body.includes('Pricing') || pricingRes.body.includes('ClockTime'), 'Pricing page content served');

    // 3. Sub-route /features/revenue-attribution
    const subRes = await request('/features/revenue-attribution');
    assert(subRes.statusCode === 200, 'Sub-route /features/revenue-attribution returns 200 OK');
    assert(subRes.body.includes('Philippine Payroll') || subRes.body.includes('DOLE'), 'Sub-route content served');

    // 4. Photorealistic Dashboard Assets in /dashboard/
    for (const imgName of ['visitors.png', 'journey.png', 'funnels.png', 'realtime.png', 'settings.png']) {
      const imgRes = await request(`/dashboard/${imgName}`);
      assert(imgRes.statusCode === 200, `Asset /dashboard/${imgName} returns 200 OK`);
      assert(imgRes.headers['content-type'].includes('image/png'), `/dashboard/${imgName} MIME type is image/png`);
    }

    // 5. Semantic Comparison Routes
    const vsSpreadsheetsRes = await request('/vs/spreadsheets');
    assert(vsSpreadsheetsRes.statusCode === 200, 'Route /vs/spreadsheets returns 200 OK');
    assert(vsSpreadsheetsRes.body.includes('Manual Spreadsheets'), '/vs/spreadsheets has authentic content');

    const vsBiometricsRes = await request('/vs/biometric-clocks');
    assert(vsBiometricsRes.statusCode === 200, 'Route /vs/biometric-clocks returns 200 OK');
    assert(vsBiometricsRes.body.includes('Biometric'), '/vs/biometric-clocks has authentic content');

    const vsForeignRes = await request('/vs/foreign-apps');
    assert(vsForeignRes.statusCode === 200, 'Route /vs/foreign-apps returns 200 OK');
    assert(vsForeignRes.body.includes('Foreign'), '/vs/foreign-apps has authentic content');

    // 6. SSE live reload endpoint /__live_reload
    const sseReq = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/__live_reload',
      method: 'GET'
    });
    const ssePromise = new Promise((resolve) => {
      sseReq.on('response', (res) => {
        assert(res.statusCode === 200, 'SSE endpoint /__live_reload returns 200 OK');
        assert(res.headers['content-type'] === 'text/event-stream', 'SSE content-type is text/event-stream');
        res.destroy();
        resolve();
      });
    });
    sseReq.end();
    await ssePromise;

    // 7. Check CSS asset loading with correct MIME type
    const cssFile = fs.readdirSync(path.join(__dirname, 'dist', '_next', 'static', 'chunks'))
      .find(f => f.endsWith('.css'));
    if (cssFile) {
      const cssRes = await request(`/_next/static/chunks/${cssFile}`);
      assert(cssRes.statusCode === 200, `CSS file /_next/static/chunks/${cssFile} returns 200 OK`);
      assert(cssRes.headers['content-type'].includes('text/css'), 'CSS MIME type is text/css');
    }

    // 8. Test Range Request (HTTP 206 Partial Content)
    if (cssFile) {
      const rangeRes = await request(`/_next/static/chunks/${cssFile}`, {
        Range: 'bytes=0-49'
      });
      assert(rangeRes.statusCode === 206, 'Range request returns HTTP 206 Partial Content');
      assert(rangeRes.headers['accept-ranges'] === 'bytes', 'Accept-Ranges header is present');
      assert(rangeRes.headers['content-range'].startsWith('bytes 0-49/'), 'Content-Range header matches requested bytes');
      assert(rangeRes.headers['content-length'] === '50', 'Content-Length is 50 bytes');
    }

    // 9. Non-existent route 404
    const notFoundRes = await request('/non-existent-page-xyz');
    assert(notFoundRes.statusCode === 404, 'Non-existent route returns 404 Not Found');

    console.log(`\nTest Results: ${passed} passed, ${failed} failed`);
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    serverProc.kill();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
