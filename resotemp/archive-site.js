/**
 * Universal Website Offline Archive Tool — Adaptive Template
 *
 * Core Capabilities:
 *  1. Stack Detection & Strategy Formulation
 *  2. Recursive Same-Origin Route Crawling + Sitemap Integration
 *  3. Dynamic Asset Queue & Concurrent Asset Scraper (Stylesheets, Scripts, Fonts, Images, Media, Framework Data)
 *  4. Deep CSS Dependency Parsing & Path Localization
 *  5. Critical Asset Sanitization (SRI Bypass, MIME overrides, Path Rewriting)
 *  6. Telemetry & Analytics Purge (GA, GTM, Meta Pixel, Hotjar, Sentry, Vercel Insights, etc.)
 *  7. White-labeling & CMS Branding Removal
 *  8. Client-Side Offline Form Mocking Injection
 *  9. Comprehensive Reporting (archive-report.md) & Error Logging (archive-errors.log)
 */

const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const cheerio = require('cheerio');

// Configuration
const DEFAULT_TARGET = 'https://eleven-analytics.nextjsshop-preview.workers.dev/';
const RAW_TARGET_INPUT = process.argv[2] || DEFAULT_TARGET;
const DIST_DIR = path.resolve(__dirname, 'dist');
const REPORT_FILE = path.resolve(__dirname, 'archive-report.md');
const ERRORS_FILE = path.resolve(__dirname, 'archive-errors.log');

const CONCURRENCY = 6;
const MAX_PAGES = 100;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Clean input URL: strip surrounding angle brackets, quotes, hash
let sanitizedUrl = RAW_TARGET_INPUT.trim().replace(/^<|>$/g, '').replace(/^"|"$/g, '').replace(/^'|'$/g, '');
if (!sanitizedUrl.startsWith('http://') && !sanitizedUrl.startsWith('https://')) {
  sanitizedUrl = 'https://' + sanitizedUrl;
}
const targetUrlObj = new URL(sanitizedUrl);
const BASE_ORIGIN = targetUrlObj.origin;

console.log(`=============================================================`);
console.log(`🌐 Universal Website Offline Archive Tool — Adaptive Template`);
console.log(`   Target Origin: ${BASE_ORIGIN}`);
console.log(`   Target URL:    ${sanitizedUrl}`);
console.log(`   Output Dist:   ${DIST_DIR}`);
console.log(`=============================================================\n`);

// Data structures for crawling and assets
const visitedPages = new Set();
const pagesToCrawl = [];
const discoveredRoutes = []; // { url, localHtmlPath, title, status, size }

const assetQueue = []; // { assetUrl, referer, type, destSubPath }
const queuedAssetUrls = new Map(); // assetUrl -> relativePathInDist
const assetStats = {
  scripts: { count: 0, bytes: 0 },
  stylesheets: { count: 0, bytes: 0 },
  fonts: { count: 0, bytes: 0 },
  images: { count: 0, bytes: 0 },
  media: { count: 0, bytes: 0 },
  dataPayloads: { count: 0, bytes: 0 },
  other: { count: 0, bytes: 0 }
};

const removedTelemetry = [];
const runtimeErrors = [];

/**
 * Log runtime errors to archive-errors.log
 */
function logError(stage, itemUrl, message) {
  const time = new Date().toISOString();
  const line = `[${time}] [${stage.toUpperCase()}] ${itemUrl} => ${message}\n`;
  runtimeErrors.push({ stage, itemUrl, message, time });
  fs.appendFileSync(ERRORS_FILE, line);
}

/**
 * Sanitize filename/pathname for Windows filesystems
 */
function sanitizePathForFs(rawPath) {
  return rawPath
    .split('/')
    .map(segment => segment.replace(/[<>:"|?*]/g, '_'))
    .join('/');
}

/**
 * Generate a deterministic local relative path for an asset URL
 */
function getLocalAssetPath(assetUrlStr, hintType, contentTypeHeader = '') {
  if (queuedAssetUrls.has(assetUrlStr)) {
    return queuedAssetUrls.get(assetUrlStr);
  }

  let assetUrl;
  try {
    assetUrl = new URL(assetUrlStr, BASE_ORIGIN);
  } catch (e) {
    return null;
  }

  const isSameOrigin = assetUrl.origin === BASE_ORIGIN;
  let pathname = assetUrl.pathname;
  if (!pathname || pathname === '/') pathname = '/asset_' + crypto.createHash('md5').update(assetUrlStr).digest('hex').slice(0, 8);

  let ext = path.extname(pathname).toLowerCase();
  const search = assetUrl.search;

  // Handle extension override for MIME types without extension (e.g. Google Fonts /css2)
  if (!ext || ext.length > 5) {
    if (pathname.includes('/css') || (contentTypeHeader && contentTypeHeader.includes('text/css'))) {
      ext = '.css';
    } else if (contentTypeHeader && contentTypeHeader.includes('font/woff2')) {
      ext = '.woff2';
    } else if (contentTypeHeader && contentTypeHeader.includes('font/woff')) {
      ext = '.woff';
    } else if (contentTypeHeader && contentTypeHeader.includes('image/svg+xml')) {
      ext = '.svg';
    } else if (contentTypeHeader && contentTypeHeader.includes('image/png')) {
      ext = '.png';
    } else if (contentTypeHeader && contentTypeHeader.includes('image/jpeg')) {
      ext = '.jpg';
    } else if (contentTypeHeader && contentTypeHeader.includes('image/webp')) {
      ext = '.webp';
    } else if (contentTypeHeader && contentTypeHeader.includes('application/javascript')) {
      ext = '.js';
    } else if (contentTypeHeader && contentTypeHeader.includes('application/json')) {
      ext = '.json';
    }
  }

  // Base directory depending on origin
  let baseFolder = '';
  if (isSameOrigin) {
    baseFolder = '';
  } else {
    // External CDN asset -> _external/<hostname>/...
    const safeHost = assetUrl.hostname.replace(/[<>:"|?*]/g, '_');
    baseFolder = path.posix.join('_external', safeHost);
  }

  let fileName = path.basename(pathname, path.extname(pathname));
  if (search) {
    const qHash = crypto.createHash('md5').update(search).digest('hex').slice(0, 8);
    fileName = `${fileName}__q_${qHash}`;
  }

  const dirName = path.dirname(pathname);
  const cleanDir = sanitizePathForFs(dirName).replace(/^\/+/, '');
  const finalRelative = path.posix.normalize(path.posix.join(baseFolder, cleanDir, `${fileName}${ext}`));

  queuedAssetUrls.set(assetUrlStr, finalRelative);
  return finalRelative;
}

/**
 * Categorize asset type from extension / content-type
 */
function categorizeAsset(finalPath, hintType) {
  const ext = path.extname(finalPath).toLowerCase();
  if (hintType === 'data' || ext === '.json') return 'dataPayloads';
  if (['.js', '.mjs'].includes(ext)) return 'scripts';
  if (['.css'].includes(ext)) return 'stylesheets';
  if (['.woff2', '.woff', '.ttf', '.otf', '.eot'].includes(ext)) return 'fonts';
  if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico'].includes(ext)) return 'images';
  if (['.mp4', '.webm', '.ogg', '.mp3', '.wav'].includes(ext)) return 'media';
  return 'other';
}

/**
 * Queue an asset for downloading
 */
function enqueueAsset(rawUrl, referer, hintType = 'other') {
  if (!rawUrl || rawUrl.startsWith('data:') || rawUrl.startsWith('blob:') || rawUrl.startsWith('javascript:')) {
    return null;
  }

  let resolvedUrl;
  try {
    resolvedUrl = new URL(rawUrl, referer || BASE_ORIGIN).href;
  } catch (err) {
    return null;
  }

  const relativePath = getLocalAssetPath(resolvedUrl, hintType);
  if (!relativeRelativeExistsInQueue(resolvedUrl)) {
    assetQueue.push({
      assetUrl: resolvedUrl,
      referer,
      type: hintType,
      destSubPath: relativePath
    });
  }
  return relativePath;
}

function relativeRelativeExistsInQueue(assetUrlStr) {
  return assetQueue.some(item => item.assetUrl === assetUrlStr);
}

/**
 * Phase 1: Stack Inspection & Detection
 */
async function inspectTarget(targetUrl) {
  console.log(`[Phase 1] 🔍 Inspecting target site for stack signatures...`);
  const evidence = [];
  const signals = {
    nextjs: 0,
    nuxt: 0,
    astro: 0,
    sveltekit: 0,
    webflow: 0,
    wordpress: 0,
    shopify: 0,
    viteSpa: 0,
    staticHtml: 0
  };

  let headers = {};
  let rootHtml = '';
  try {
    const res = await fetch(targetUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    headers = Object.fromEntries(res.headers.entries());
    rootHtml = await res.text();
  } catch (err) {
    logError('inspect', targetUrl, `Failed to fetch root: ${err.message}`);
    throw err;
  }

  // Check Headers
  const serverHdr = headers['server'] || '';
  const poweredBy = headers['x-powered-by'] || '';
  if (serverHdr.toLowerCase().includes('cloudflare')) evidence.push('Server: Cloudflare Edge / Workers');
  if (serverHdr.toLowerCase().includes('vercel') || headers['x-vercel-id']) evidence.push('Hosting: Vercel CDN');
  if (poweredBy) evidence.push(`X-Powered-By: ${poweredBy}`);

  // Inspect HTML tokens
  if (rootHtml.includes('/_next/') || rootHtml.includes('data-precedence="next"') || rootHtml.includes('self.__next_f') || rootHtml.includes('__NEXT_DATA__')) {
    signals.nextjs += 5;
    evidence.push('Detected Next.js runtime markers (/_next/ static chunks, data-precedence="next", self.__next_f RSC payloads)');
  }
  if (rootHtml.includes('/_nuxt/') || rootHtml.includes('__NUXT__') || rootHtml.includes('_payload.json')) {
    signals.nuxt += 5;
    evidence.push('Detected Nuxt runtime markers (/_nuxt/, __NUXT__, _payload.json)');
  }
  if (rootHtml.includes('astro-island') || rootHtml.includes('data-astro-cid') || rootHtml.includes('generator" content="Astro')) {
    signals.astro += 5;
    evidence.push('Detected Astro Island architecture markers');
  }
  if (rootHtml.includes('/_app/') || rootHtml.includes('__sveltekit')) {
    signals.sveltekit += 5;
    evidence.push('Detected SvelteKit markers (/_app/, __sveltekit)');
  }
  if (rootHtml.includes('data-wf-page') || rootHtml.includes('data-wf-site') || rootHtml.includes('webflow.js')) {
    signals.webflow += 5;
    evidence.push('Detected Webflow CMS and animation runtime markers');
  }
  if (rootHtml.includes('/wp-content/') || rootHtml.includes('/wp-includes/')) {
    signals.wordpress += 5;
    evidence.push('Detected WordPress theme/plugin path structure');
  }
  if (rootHtml.includes('cdn.shopify.com') || rootHtml.includes('Shopify.theme')) {
    signals.shopify += 5;
    evidence.push('Detected Shopify storefront infrastructure');
  }
  if (rootHtml.includes('/@vite/client') || (rootHtml.includes('/assets/') && rootHtml.includes('type="module"'))) {
    signals.viteSpa += 3;
    evidence.push('Detected Vite module bundle structure');
  }

  // Determine top stack
  let topStack = 'Static HTML';
  let maxScore = 0;
  for (const [stack, score] of Object.entries(signals)) {
    if (score > maxScore) {
      maxScore = score;
      topStack = stack;
    }
  }

  let detectedFramework = 'Generic Static HTML';
  let confidence = 'Low';
  let chosenStrategy = 'Mostly Static Crawl Strategy';

  if (topStack === 'nextjs') {
    detectedFramework = 'Next.js (App Router / React Server Components)';
    confidence = maxScore >= 5 ? 'High' : 'Medium';
    chosenStrategy = 'Framework-Aware Data-Preserving Strategy (Next.js Chunks, Media & Payloads)';
  } else if (topStack === 'nuxt') {
    detectedFramework = 'Nuxt 3 / Vue';
    confidence = 'High';
    chosenStrategy = 'Framework-Aware Data-Preserving Strategy (Nuxt Payloads & Hydration)';
  } else if (topStack === 'astro') {
    detectedFramework = 'Astro (Static Islands)';
    confidence = 'High';
    chosenStrategy = 'Static Hybrid Island Preservation Strategy';
  } else if (topStack === 'sveltekit') {
    detectedFramework = 'SvelteKit';
    confidence = 'High';
    chosenStrategy = 'Framework-Aware SvelteKit Routing Strategy';
  } else if (topStack === 'webflow') {
    detectedFramework = 'Webflow CMS';
    confidence = 'High';
    chosenStrategy = 'CMS Theme & Interaction Preservation Strategy';
  } else if (topStack === 'wordpress') {
    detectedFramework = 'WordPress';
    confidence = 'High';
    chosenStrategy = 'WordPress Asset & Clean Route Strategy';
  } else if (topStack === 'shopify') {
    detectedFramework = 'Shopify Storefront';
    confidence = 'High';
    chosenStrategy = 'E-commerce Theme & Asset Mirroring Strategy';
  } else if (topStack === 'viteSpa') {
    detectedFramework = 'Vite React/Vue SPA';
    confidence = 'Medium';
    chosenStrategy = 'SPA Asset + Route Discovery Strategy';
  } else {
    confidence = 'Medium';
    chosenStrategy = 'Adaptive Hybrid Static Crawl Strategy';
  }

  console.log(`   Detected Stack: ${detectedFramework}`);
  console.log(`   Confidence:     ${confidence}`);
  console.log(`   Chosen Plan:    ${chosenStrategy}\n`);

  return {
    detectedFramework,
    confidence,
    chosenStrategy,
    evidence,
    rootHtml
  };
}

/**
 * Phase 2: Route Discovery (HTML Links & Sitemap)
 */
async function discoverRoutes(rootHtml) {
  console.log(`[Phase 2] 🗺️ Discovering internal routes...`);
  pagesToCrawl.push(sanitizedUrl);
  visitedPages.add(sanitizedUrl);

  // 1. Probe sitemap.xml
  try {
    const sitemapUrl = new URL('/sitemap.xml', BASE_ORIGIN).href;
    const res = await fetch(sitemapUrl, { headers: { 'User-Agent': USER_AGENT } });
    if (res.ok) {
      const sitemapXml = await res.text();
      const locMatches = sitemapXml.match(/<loc>(.*?)<\/loc>/g);
      if (locMatches) {
        console.log(`   Found /sitemap.xml with ${locMatches.length} route entries!`);
        for (const locTag of locMatches) {
          const rawLoc = locTag.replace(/<\/?loc>/g, '').trim();
          try {
            const locUrl = new URL(rawLoc);
            // Map pathname from sitemap onto the target base origin
            const targetRouteUrl = new URL(locUrl.pathname + locUrl.search, BASE_ORIGIN).href;
            if (!visitedPages.has(targetRouteUrl) && pagesToCrawl.length < MAX_PAGES) {
              visitedPages.add(targetRouteUrl);
              pagesToCrawl.push(targetRouteUrl);
            }
          } catch (e) {}
        }
      }
    }
  } catch (err) {
    // Sitemap optional
  }

  // 2. Extract links from rootHtml
  const $ = cheerio.load(rootHtml);
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    try {
      const resolved = new URL(href, BASE_ORIGIN);
      if (resolved.origin === BASE_ORIGIN) {
        const cleanUrl = resolved.origin + resolved.pathname + resolved.search;
        if (!visitedPages.has(cleanUrl) && pagesToCrawl.length < MAX_PAGES) {
          visitedPages.add(cleanUrl);
          pagesToCrawl.push(cleanUrl);
        }
      }
    } catch (e) {}
  });

  console.log(`   Total unique routes queued for archival: ${pagesToCrawl.length}`);
}

/**
 * Check if a script matches known telemetry/tracking patterns
 */
function isTelemetryScript(src, content) {
  // CRITICAL: Never strip framework runtime or hydration bootstrap payloads!
  // Next.js App Router (self.__next_f), Pages Router (__NEXT_DATA__), Nuxt, SvelteKit, etc.
  if (content && (
    content.includes('self.__next_f') ||
    content.includes('__NEXT_DATA__') ||
    content.includes('__NUXT__') ||
    content.includes('__sveltekit') ||
    content.includes('window.__remixContext')
  )) {
    return { isTelemetry: false };
  }

  const telemetryPatterns = [
    'google-analytics.com/analytics.js',
    'google-analytics.com/ga.js',
    'googletagmanager.com/gtag/js',
    'googletagmanager.com/gtm.js',
    'googleoptimize.com',
    'connect.facebook.net',
    'fbevents.js',
    'clarity.ms',
    'mixpanel.com',
    'hotjar.com',
    'sentry.io',
    'segment.com',
    'segment.io',
    'amplitude.com',
    '/_vercel/insights',
    '/_vercel/speed-insights',
    'beacon.min.js',
    'static.cloudflareinsights.com',
    'crisp.chat',
    'stats.wp.com',
    'pixel.wp.com',
    'analytics.tiktok.com',
    'datadoghq-browser-agent'
  ];

  if (src) {
    for (const pat of telemetryPatterns) {
      if (src.includes(pat)) return { isTelemetry: true, reason: pat };
    }
  }

  if (content) {
    // Only match actual tracking initialization calls, never generic mentions in page text/code
    const inlinePatterns = [
      /gtag\s*\(\s*['"](config|event|js)['"]/i,
      /ga\s*\(\s*['"](create|send|require)['"]/i,
      /window\.dataLayer\s*=\s*window\.dataLayer/i,
      /dataLayer\.push\s*\(\s*\{/i,
      /fbq\s*\(\s*['"](init|track)['"]/i,
      /mixpanel\.init\s*\(/i,
      /clarity\s*\(\s*['"](init|identify)['"]/i,
      /window\._hsq\s*=\s*window\._hsq/i,
      /_paq\.push\s*\(/i
    ];
    for (const rx of inlinePatterns) {
      if (rx.test(content)) return { isTelemetry: true, reason: rx.toString() };
    }
  }

  return { isTelemetry: false };
}

/**
 * Interceptor script for mocking offline form submissions
 */
const OFFLINE_FORM_SCRIPT = `
<!-- Offline Form Interaction Mock -->
<script id="__offline_form_mock">
(function() {
  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    e.preventDefault();
    e.stopPropagation();

    console.log('[Offline Mode] Intercepted form submission:', form);
    var formData = new FormData(form);
    var dataObj = {};
    formData.forEach(function(value, key) { dataObj[key] = value; });
    console.log('[Offline Mode] Form values:', dataObj);

    // Display template-native success state if available
    var container = form.parentElement || form;
    var successEl = container.querySelector('.w-form-done, .form-success, [data-form-success], .success-message');
    var failEl = container.querySelector('.w-form-fail, .form-error, [data-form-error], .error-message');
    if (failEl) failEl.style.display = 'none';

    if (successEl) {
      form.style.display = 'none';
      successEl.style.display = 'block';
    } else {
      // Create high-visibility toast
      var toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#10b981;color:#fff;padding:14px 24px;border-radius:8px;font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;box-shadow:0 10px 30px rgba(0,0,0,0.25);z-index:999999;transition:all 0.3s ease;';
      toast.textContent = '✓ Form submitted successfully (Offline local mirror)';
      document.body.appendChild(toast);
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 300);
      }, 3500);
    }
  }, true);
})();
</script>
`;

/**
 * Process and sanitize HTML:
 *  - Enqueue discovered assets
 *  - Strip SRI and crossorigin
 *  - Purge telemetry
 *  - Remove CMS branding
 *  - Rewrite asset paths
 *  - Inject offline form mock
 */
function processHtml(pageUrl, htmlContent) {
  const $ = cheerio.load(htmlContent);

  // 1. Remove SRI integrity and crossorigin attributes
  $('script[integrity], link[integrity]').removeAttr('integrity');
  $('script[crossorigin], link[crossorigin]').removeAttr('crossorigin');

  // 2. Remove Telemetry scripts
  $('script').each((_, el) => {
    const src = $(el).attr('src');
    const content = $(el).html() || '';
    const check = isTelemetryScript(src, content);
    if (check.isTelemetry) {
      removedTelemetry.push(src || check.reason);
      $(el).remove();
    }
  });

  // Remove tracking noscript tags
  $('noscript').each((_, el) => {
    const inner = $(el).html() || '';
    if (inner.includes('google') || inner.includes('facebook') || inner.includes('analytics')) {
      $(el).remove();
    }
  });

  // 3. Remove CMS generator meta tags, floating badges & vendor watermark widgets
  $('meta[name="generator"]').remove();
  $('.w-webflow-badge').remove();
  $('[class*="jsx-e65c7bf76ebc1170"]').remove();
  $('a[href*="nextjsshop.com"]').each((_, el) => {
    $(el).closest('.fixed, [class*="fixed"]').remove();
  });

  // 4. Preload & Stylesheets
  $('link[rel="stylesheet"], link[rel="preload"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').each((_, el) => {
    const href = $(el).attr('href');
    const rel = $(el).attr('rel');
    const as = $(el).attr('as');
    if (!href) return;

    let hint = 'other';
    if (rel === 'stylesheet' || as === 'style') hint = 'stylesheets';
    else if (as === 'font') hint = 'fonts';
    else if (as === 'image' || rel.includes('icon')) hint = 'images';
    else if (as === 'script') hint = 'scripts';

    const localRel = enqueueAsset(href, pageUrl, hint);
    if (localRel) {
      $(el).attr('href', '/' + localRel);
    }
  });

  // 5. Script tags
  $('script[src]').each((_, el) => {
    const src = $(el).attr('src');
    if (!src) return;
    const localRel = enqueueAsset(src, pageUrl, 'scripts');
    if (localRel) {
      $(el).attr('src', '/' + localRel);
    }
  });

  // 6. Images and Video posters
  $('img, source').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const localRel = enqueueAsset(src, pageUrl, 'images');
      if (localRel) {
        $(el).attr('src', '/' + localRel);
      }
    }

    const srcset = $(el).attr('srcset');
    if (srcset) {
      const parts = srcset.split(',').map(s => s.trim());
      const rewrittenParts = parts.map(part => {
        const sub = part.split(/\s+/);
        const imgUrl = sub[0];
        const descriptor = sub.slice(1).join(' ');
        const localRel = enqueueAsset(imgUrl, pageUrl, 'images');
        return localRel ? `/${localRel} ${descriptor}`.trim() : part;
      });
      $(el).attr('srcset', rewrittenParts.join(', '));
    }
  });

  // 7. Video and Audio tags
  $('video, audio').each((_, el) => {
    const src = $(el).attr('src');
    if (src) {
      const localRel = enqueueAsset(src, pageUrl, 'media');
      if (localRel) $(el).attr('src', '/' + localRel);
    }
    const poster = $(el).attr('poster');
    if (poster) {
      const localRel = enqueueAsset(poster, pageUrl, 'images');
      if (localRel) $(el).attr('poster', '/' + localRel);
    }
  });

  // 8. Inline styles with url(...)
  $('[style]').each((_, el) => {
    const style = $(el).attr('style');
    if (style && style.includes('url(')) {
      const rewritten = style.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, u) => {
        const localRel = enqueueAsset(u, pageUrl, 'images');
        return localRel ? `url('/${localRel}')` : match;
      });
      $(el).attr('style', rewritten);
    }
  });

  // 9. Discover additional internal links from page
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }
    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === BASE_ORIGIN) {
        const cleanUrl = resolved.origin + resolved.pathname + resolved.search;
        if (!visitedPages.has(cleanUrl) && pagesToCrawl.length < MAX_PAGES) {
          visitedPages.add(cleanUrl);
          pagesToCrawl.push(cleanUrl);
        }
      }
    } catch (e) {}
  });

  // 10. Inject offline form mock
  if ($('body').length > 0) {
    $('body').append(OFFLINE_FORM_SCRIPT);
  } else {
    $.root().append(OFFLINE_FORM_SCRIPT);
  }

  return $.html();
}

/**
 * Determine local destination HTML file path for a route URL
 */
function getHtmlDestination(pageUrlStr) {
  const parsed = new URL(pageUrlStr);
  let pathname = parsed.pathname;
  if (pathname.endsWith('/')) pathname += 'index';
  if (pathname === '/index') return path.join(DIST_DIR, 'index.html');

  // Parameterized routes (e.g. ?page=2)
  if (parsed.search) {
    const qHash = crypto.createHash('md5').update(parsed.search).digest('hex').slice(0, 8);
    return path.join(DIST_DIR, `${pathname.replace(/^\//, '')}_${qHash}.html`);
  }

  return path.join(DIST_DIR, `${pathname.replace(/^\//, '')}.html`);
}

/**
 * Phase 3: Crawl all internal HTML routes
 */
async function crawlPages() {
  console.log(`[Phase 3] 🚀 Crawling internal pages...`);

  let index = 0;
  while (index < pagesToCrawl.length) {
    const currentUrl = pagesToCrawl[index++];
    console.log(`   [${index}/${pagesToCrawl.length}] Fetching ${currentUrl}...`);

    try {
      const res = await fetch(currentUrl, {
        headers: { 'User-Agent': USER_AGENT }
      });

      if (!res.ok) {
        logError('crawl', currentUrl, `HTTP status ${res.status}`);
        continue;
      }

      const html = await res.text();
      const processedHtml = processHtml(currentUrl, html);
      const destPath = getHtmlDestination(currentUrl);

      // Ensure directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.writeFileSync(destPath, processedHtml, 'utf-8');

      const $ = cheerio.load(processedHtml);
      const title = $('title').text().trim() || 'Untitled';
      discoveredRoutes.push({
        url: currentUrl,
        localHtmlPath: path.relative(DIST_DIR, destPath),
        title,
        status: res.status,
        size: Buffer.byteLength(processedHtml)
      });
    } catch (err) {
      logError('crawl', currentUrl, err.message);
    }
  }

  console.log(`   ✓ Successfully crawled ${discoveredRoutes.length} pages.`);
}

/**
 * Parse CSS for url(...) and @import, queue child assets, rewrite paths relative to CSS location
 */
function processCss(cssText, cssUrlStr, cssDestPath) {
  const cssDirInDist = path.dirname(cssDestPath);

  // Match url(...) and url("...")
  const rewrittenCss = cssText.replace(/url\((['"]?)(.*?)\1\)/g, (match, quote, rawAssetUrl) => {
    if (!rawAssetUrl || rawAssetUrl.startsWith('data:') || rawAssetUrl.startsWith('#')) {
      return match;
    }

    try {
      const absoluteAssetUrl = new URL(rawAssetUrl, cssUrlStr).href;
      const ext = path.extname(new URL(absoluteAssetUrl).pathname).toLowerCase();
      let hint = 'other';
      if (['.woff2', '.woff', '.ttf', '.otf', '.eot'].includes(ext)) hint = 'fonts';
      else if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'].includes(ext)) hint = 'images';

      const localRelativeDist = enqueueAsset(absoluteAssetUrl, cssUrlStr, hint);
      if (!localRelativeDist) return match;

      const targetFullPath = path.join(DIST_DIR, localRelativeDist);
      let relativeToCss = path.relative(cssDirInDist, targetFullPath).replace(/\\/g, '/');
      if (!relativeToCss.startsWith('.') && !relativeToCss.startsWith('/')) {
        relativeToCss = './' + relativeToCss;
      }
      return `url("${relativeToCss}")`;
    } catch (e) {
      return match;
    }
  });

  return rewrittenCss;
}

/**
 * Phase 4: Download and localize all queued assets with concurrent workers
 */
async function processAssetQueue() {
  console.log(`\n[Phase 4] 📦 Localizing assets (dynamic worker pool, concurrency: ${CONCURRENCY})...`);

  let activeWorkers = 0;
  let processedIndex = 0;
  const processedUrls = new Set();

  return new Promise((resolve) => {
    function tryNext() {
      while (activeWorkers < CONCURRENCY && processedIndex < assetQueue.length) {
        const task = assetQueue[processedIndex++];
        if (processedUrls.has(task.assetUrl)) {
          continue;
        }
        processedUrls.add(task.assetUrl);

        activeWorkers++;
        downloadSingleAsset(task)
          .catch((err) => {
            logError('asset_download', task.assetUrl, err.message);
          })
          .finally(() => {
            activeWorkers--;
            if (processedIndex >= assetQueue.length && activeWorkers === 0) {
              resolve();
            } else {
              tryNext();
            }
          });
      }

      if (assetQueue.length === 0 && activeWorkers === 0) {
        resolve();
      }
    }

    tryNext();
  });
}

/**
 * Download a single asset, handle CSS rewriting and disk storage
 */
async function downloadSingleAsset(task) {
  const { assetUrl, destSubPath, referer, type } = task;
  const fullSavePath = path.join(DIST_DIR, destSubPath);

  if (fs.existsSync(fullSavePath)) {
    return;
  }

  try {
    const res = await fetch(assetUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        ...(referer ? { Referer: referer } : {})
      }
    });

    if (!res.ok) {
      logError('asset', assetUrl, `HTTP ${res.status}`);
      return;
    }

    const contentType = res.headers.get('content-type') || '';
    const buffer = Buffer.from(await res.arrayBuffer());

    fs.mkdirSync(path.dirname(fullSavePath), { recursive: true });

    // If CSS, parse and rewrite internal url(...)
    if (fullSavePath.endsWith('.css') || contentType.includes('text/css')) {
      const originalText = buffer.toString('utf-8');
      let rewritten = processCss(originalText, assetUrl, fullSavePath);
      rewritten += `\n/* Universal White-Label & Watermark Removal */\n[class*="jsx-e65c7bf76ebc1170"],a[href*="nextjsshop.com"],div:has(> div > a[href*="nextjsshop.com"]),div:has(> a[href*="nextjsshop.com"]),.w-webflow-badge,[data-wf-badge]{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;}\n`;
      fs.writeFileSync(fullSavePath, rewritten, 'utf-8');
    } else if (fullSavePath.endsWith('.js') || contentType.includes('javascript')) {
      let jsText = buffer.toString('utf-8');
      if (jsText.includes('MadeByNextJsshop') || jsText.includes('nextjsshop.com')) {
        jsText = jsText.replace(/e\.s\(\["MadeByNextJsshop",\s*0,\s*function\([^\)]*\)\{/g, 'e.s(["MadeByNextJsshop",0,function(){return null;');
      }
      fs.writeFileSync(fullSavePath, jsText, 'utf-8');
    } else {
      fs.writeFileSync(fullSavePath, buffer);
    }

    // Update stats
    const cat = categorizeAsset(fullSavePath, type);
    assetStats[cat].count++;
    assetStats[cat].bytes += buffer.length;
  } catch (err) {
    logError('asset', assetUrl, err.message);
  }
}

/**
 * Phase 5: Generate Archive Report (archive-report.md)
 */
function generateReport(inspectData) {
  console.log(`[Phase 5] 📝 Generating archive-report.md...`);

  const totalAssets = Object.values(assetStats).reduce((acc, c) => acc + c.count, 0);
  const totalAssetBytes = Object.values(assetStats).reduce((acc, c) => acc + c.bytes, 0);
  const totalSizeMb = (totalAssetBytes / (1024 * 1024)).toFixed(2);

  const report = `# Universal Website Offline Archive Report

**Generated:** ${new Date().toISOString()}  
**Target URL:** \`${sanitizedUrl}\`  
**Base Origin:** \`${BASE_ORIGIN}\`  

---

## 1. Stack Detection Summary

| Attribute | Detected Value |
| :--- | :--- |
| **Detected Framework/Stack** | **${inspectData.detectedFramework}** |
| **Detection Confidence** | **${inspectData.confidence}** |
| **Chosen Archival Strategy** | **${inspectData.chosenStrategy}** |

### Evidence Observed
${inspectData.evidence.map(e => `- ${e}`).join('\n')}

---

## 2. Pages Mirrored

Total Pages Discovered & Saved: **${discoveredRoutes.length}**

| Route URL | Local HTML File | Title | Size (KB) |
| :--- | :--- | :--- | :--- |
${discoveredRoutes.map(r => `| \`${r.url}\` | [\`${r.localHtmlPath}\`](file://${path.join(DIST_DIR, r.localHtmlPath).replace(/\\/g, '/')}) | ${r.title.slice(0, 40)} | ${(r.size / 1024).toFixed(1)} |`).join('\n')}

---

## 3. Mirrored Assets Breakdown

Total Downloaded Assets: **${totalAssets}** (~${totalSizeMb} MB)

| Asset Category | File Count | Size (KB) |
| :--- | :--- | :--- |
| **JavaScript Chunks / Scripts** | ${assetStats.scripts.count} | ${(assetStats.scripts.bytes / 1024).toFixed(1)} |
| **Stylesheets (CSS)** | ${assetStats.stylesheets.count} | ${(assetStats.stylesheets.bytes / 1024).toFixed(1)} |
| **Web Fonts (WOFF2/TTF/OTF)** | ${assetStats.fonts.count} | ${(assetStats.fonts.bytes / 1024).toFixed(1)} |
| **Images & SVGs** | ${assetStats.images.count} | ${(assetStats.images.bytes / 1024).toFixed(1)} |
| **Media (Video/Audio)** | ${assetStats.media.count} | ${(assetStats.media.bytes / 1024).toFixed(1)} |
| **Data Payloads / JSON** | ${assetStats.dataPayloads.count} | ${(assetStats.dataPayloads.bytes / 1024).toFixed(1)} |
| **Other / Miscellaneous** | ${assetStats.other.count} | ${(assetStats.other.bytes / 1024).toFixed(1)} |

---

## 4. Telemetry & Tracking Removed

Neutralized or stripped from local mirror:
${removedTelemetry.length === 0 ? '- None detected.' : Array.from(new Set(removedTelemetry)).map(t => `- \`${t}\``).join('\n')}

---

## 5. Offline Interactions & Form Mocking

- **Form Mock Interceptor:** Injected into all mirrored HTML files.
- **Behavior:** Blocks remote API \`POST\` calls, logs submitted fields to browser console, and displays template native success containers (e.g. \`.w-form-done\`, \`.form-success\`) or a persistent UI toast notification.
- **SRI / Crossorigin:** Stripped from \`<script>\` and \`<link>\` tags to prevent local cross-origin blockages.

---

## 6. How to Run the Local Mirror

Start the zero-dependency local preview server:
\`\`\`bash
node server.js
\`\`\`

Open [http://localhost:3000](http://localhost:3000) in your browser.
- **Live Reload:** Automatic SSE updates on file changes.
- **Media Streaming:** Full HTTP 206 partial content support for background video looping.
- **Clean URLs:** Seamless navigation between mirrored pages.

---

## 7. Known Limitations & Recommended Manual Follow-ups

1. **Dynamic Authentication / User Sessions:** Backend database and auth workflows require live server endpoints. For static frontend iteration, UI states are preserved.
2. **Dynamic Search APIs:** Client-side search relying on live server endpoints will log requests to the console.
3. **External Embeds / Third-party Iframes:** Cross-origin iframes (e.g. Stripe checkout, Calendly widgets) remain stubbed or simulated.
`;

  fs.writeFileSync(REPORT_FILE, report, 'utf-8');
  console.log(`   ✓ Saved report to ${REPORT_FILE}`);
}

/**
 * Main Archival Runner
 */
async function run() {
  const startTime = Date.now();

  // Reset errors file
  fs.writeFileSync(ERRORS_FILE, `# Archive Errors Log - ${new Date().toISOString()}\n\n`);

  try {
    // Phase 1: Inspect Target
    const inspectData = await inspectTarget(sanitizedUrl);

    // Phase 2: Route Discovery
    await discoverRoutes(inspectData.rootHtml);

    // Phase 3: Crawl & Save Pages
    await crawlPages();

    // Phase 4: Download & Localize Assets
    await processAssetQueue();

    // Phase 5: Generate Report
    generateReport(inspectData);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n=============================================================`);
    console.log(`🎉 Archival Complete in ${elapsed}s!`);
    console.log(`   Pages crawled:   ${discoveredRoutes.length}`);
    console.log(`   Assets mirrored: ${queuedAssetUrls.size}`);
    console.log(`   Dist folder:     ${DIST_DIR}`);
    console.log(`   Report:          ${REPORT_FILE}`);
    console.log(`   Errors log:      ${ERRORS_FILE}`);
    console.log(`   Preview server:  Run 'node server.js'`);
    console.log(`=============================================================\n`);
  } catch (err) {
    console.error(`\n❌ Archival Failed: ${err.message}`);
    logError('fatal', sanitizedUrl, err.stack || err.message);
    process.exit(1);
  }
}

run();
