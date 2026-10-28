/**
 * Local Development Server
 * Zero-dependency local Node.js HTTP server.
 * Supports:
 *  - Clean URLs (/about -> /about.html or /about/index.html)
 *  - Live Reloading via Server-Sent Events (SSE)
 *  - HTTP Range Requests (HTTP 206 Partial Content for seamless video/audio streaming)
 *  - Accurate MIME types
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const DEFAULT_PORT = parseInt(process.env.PORT || '4000', 10);
const DIST_DIR = path.resolve(__dirname, 'dist');

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.ogv': 'video/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

// SSE Live Reload Clients
const sseClients = new Set();

// Client script injected into served HTML files for live reload and white-labeling
const LIVE_RELOAD_SCRIPT = `
<!-- Local Development Live Reload & White-Labeling -->
<style id="__white_label_styles">
[class*="jsx-e65c7bf76ebc1170"],
a[href*="nextjsshop.com"],
div:has(> div > a[href*="nextjsshop.com"]),
div:has(> a[href*="nextjsshop.com"]),
.w-webflow-badge,
[data-wf-badge] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
</style>
<script id="__local_live_reload">
(function() {
  if (window.__live_reload_connected) return;
  window.__live_reload_connected = true;
  let es;
  function connect() {
    es = new EventSource('/__live_reload');
    es.onopen = function() {
      console.log('[LiveReload] Connected to dev server');
    };
    es.onmessage = function(event) {
      if (event.data === 'reload') {
        console.log('[LiveReload] Change detected, reloading page...');
        location.reload();
      }
    };
    es.onerror = function() {
      es.close();
      setTimeout(connect, 2000);
    };
  }
  connect();
})();
</script>
`;

// Set up directory watcher for live reload with debouncing
let reloadTimeout = null;
function broadcastReload() {
  if (reloadTimeout) clearTimeout(reloadTimeout);
  reloadTimeout = setTimeout(() => {
    console.log(`[LiveReload] Notifying ${sseClients.size} client(s) to reload...`);
    for (const res of sseClients) {
      try {
        res.write('data: reload\n\n');
      } catch (err) {
        sseClients.delete(res);
      }
    }
  }, 150);
}

function startFileWatcher() {
  if (!fs.existsSync(DIST_DIR)) {
    return;
  }
  try {
    fs.watch(DIST_DIR, { recursive: true }, (eventType, filename) => {
      // Ignore temporary or dot files
      if (filename && (filename.startsWith('.') || filename.endsWith('.tmp'))) {
        return;
      }
      broadcastReload();
    });
    console.log(`[LiveReload] Watching ${DIST_DIR} for changes`);
  } catch (err) {
    console.warn(`[LiveReload] Warning: Could not watch directory (${err.message})`);
  }
}

/**
 * Resolve request URL to local file path in dist/
 */
function resolveFilePath(reqUrl) {
  const parsed = new URL(reqUrl, 'http://localhost');
  let pathname = decodeURIComponent(parsed.pathname || '/');

  // Strip Next.js RSC router prefetch paths
  if (pathname.includes('__next._tree.txt')) {
    pathname = pathname.replace(/\/__next\._tree\.txt.*/, '');
    if (!pathname || pathname === '') pathname = '/';
  }

  // Semantic route aliases
  const routeAliases = {
    '/docs': '/docs.html',
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
  if (routeAliases[pathname]) {
    pathname = routeAliases[pathname];
  } else if (pathname.startsWith('/demo/')) {
    pathname = '/pricing.html';
  }

  // If path is root
  if (pathname === '/' || pathname === '') {
    return path.join(DIST_DIR, 'index.html');
  }

  // Prevent directory traversal attacks
  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let fullPath = path.join(DIST_DIR, safePath);

  // 1. Direct file match
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    return fullPath;
  }

  // 2. Clean URL mapping: check if <pathname>.html exists (e.g. /about -> /about.html)
  const htmlPath = fullPath + '.html';
  if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).isFile()) {
    return htmlPath;
  }

  // 3. Directory index: check if <pathname>/index.html exists
  const indexPath = path.join(fullPath, 'index.html');
  if (fs.existsSync(indexPath) && fs.statSync(indexPath).isFile()) {
    return indexPath;
  }

  // 4. Query string mapping: check if pathname + query hash exists
  if (parsed.search) {
    const crypto = require('crypto');
    const qHash = crypto.createHash('md5').update(parsed.search).digest('hex').slice(0, 8);
    const queryPath = path.join(DIST_DIR, `${safePath}_${qHash}.html`);
    if (fs.existsSync(queryPath) && fs.statSync(queryPath).isFile()) {
      return queryPath;
    }
  }

  return null;
}

/**
 * HTTP Request Handler
 */
function handleRequest(req, res) {
  const reqUrl = req.url || '/';
  const parsed = new URL(reqUrl, 'http://localhost');

  // Handle Next.js App Router RSC prefetch requests
  const isRsc = reqUrl.includes('__next._tree.txt') || parsed.searchParams.has('_rsc') || req.headers['rsc'] === '1';
  if (isRsc) {
    const resolved = resolveFilePath(reqUrl);
    if (resolved && (resolved.endsWith('.html') || resolved.endsWith('.htm'))) {
      try {
        const html = fs.readFileSync(resolved, 'utf8');
        const rscMatches = html.match(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g) || [];
        let rscPayload = '';
        for (const m of rscMatches) {
          const inner = m.match(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/);
          if (inner && inner[1]) {
            try {
              rscPayload += JSON.parse('"' + inner[1] + '"');
            } catch(e) {
              rscPayload += inner[1];
            }
          }
        }
        res.writeHead(200, {
          'Content-Type': 'text/x-component; charset=utf-8',
          'Vary': 'RSC, Next-Router-State-Tree, Next-Router-Prefetch',
          'Cache-Control': 'no-cache'
        });
        res.end(rscPayload);
        return;
      } catch (err) {
        res.writeHead(204, { 'Content-Type': 'text/x-component; charset=utf-8' });
        res.end();
        return;
      }
    }
  }

  // Handle SSE endpoint
  if (reqUrl === '/__live_reload') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('data: connected\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // Check if dist folder exists
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>Archive Dist Missing</title><style>body{font-family:sans-serif;max-width:600px;margin:50px auto;padding:20px;line-height:1.6;}</style></head>
        <body>
          <h2>No <code>dist/</code> directory found</h2>
          <p>Please run the archiver first:</p>
          <pre><code>node archive-site.js &lt;URL&gt;</code></pre>
        </body>
      </html>
    `);
    return;
  }

  const filePath = resolveFilePath(reqUrl);

  if (!filePath) {
    // Check if dist/404.html exists
    const custom404 = path.join(DIST_DIR, '404.html');
    if (fs.existsSync(custom404)) {
      const content = fs.readFileSync(custom404, 'utf-8');
      const injected = content.includes('</body>')
        ? content.replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`)
        : content + LIVE_RELOAD_SCRIPT;
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(injected);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
        <head><title>404 Not Found</title><style>body{font-family:sans-serif;max-width:600px;margin:50px auto;padding:20px;line-height:1.6;}</style></head>
        <body>
          <h2>404 — Not Found</h2>
          <p>The requested path <code>${reqUrl}</code> could not be found in the local archive.</p>
          <p><a href="/">Return to Home</a></p>
        </body>
      </html>
    `);
    return;
  }

  try {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // HTTP 206 Partial Content for Range Requests (crucial for video/audio seeking & looping)
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

      if (start >= stat.size || end >= stat.size || start > end) {
        res.writeHead(416, {
          'Content-Range': `bytes */${stat.size}`,
          'Accept-Ranges': 'bytes'
        });
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'no-cache'
      });

      fileStream.pipe(res);
      return;
    }

    // HTML handling: Inject Live Reload Script
    if (ext === '.html' || ext === '.htm') {
      let htmlContent = fs.readFileSync(filePath, 'utf-8');
      if (htmlContent.includes('</body>')) {
        htmlContent = htmlContent.replace('</body>', `${LIVE_RELOAD_SCRIPT}</body>`);
      } else if (htmlContent.includes('</html>')) {
        htmlContent = htmlContent.replace('</html>', `${LIVE_RELOAD_SCRIPT}</html>`);
      } else {
        htmlContent += LIVE_RELOAD_SCRIPT;
      }

      res.writeHead(200, {
        'Content-Type': contentType,
        'Content-Length': Buffer.byteLength(htmlContent),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache'
      });
      res.end(htmlContent);
      return;
    }

    // All other static assets
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  } catch (err) {
    console.error(`[Server Error] ${err.message}`);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(`Internal Server Error: ${err.message}`);
  }
}

/**
 * Start HTTP server with port hunting if port is taken
 */
function startServer(port) {
  const server = http.createServer(handleRequest);

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${port} is in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error(`Server failed to start: ${err.message}`);
      process.exit(1);
    }
  });

  server.listen(port, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Offline Archive Preview Server is live!`);
    console.log(`   Local URL:    http://localhost:${port}/`);
    console.log(`   Serving from: ${DIST_DIR}`);
    console.log(`   Live Reload:  Active via SSE (/__live_reload)`);
    console.log(`   Range Media:  Supported (HTTP 206 for video/audio)`);
    console.log(`======================================================\n`);
    startFileWatcher();
  });
}

const requestedPort = parseInt(process.argv[2] || process.env.PORT || `${DEFAULT_PORT}`, 10);
startServer(requestedPort);
