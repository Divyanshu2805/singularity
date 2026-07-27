/**
 * The preview proxy: routes every preview hostname to the runner pod serving it.
 *
 * Handles: looking a hostname's route up in Redis, proxying both HTTP and websockets to that pod, recording that a
 * preview was visited, rewriting a page load's HTML on the way out to inject the runtime-error reporter, and serving
 * a readable page when there is no route or the runner does not answer.
 *
 * The backend writes the route key once a preview's dev server answers and removes it when the preview stops; this
 * writes the last-seen key as pages load, which is how the backend's idle reaper knows a preview open in its own tab
 * is still in use. Keep both key names in step with the backend's router - nothing else ties the two together.
 *
 * Redis waits are bounded on purpose: an unlimited command queue turns an outage into requests that hang forever
 * rather than failing, and the last-seen map is swept so a long-lived process cannot accumulate one entry per
 * hostname it has ever served.
 *
 * The HTML rewrite asks for an uncompressed response, since it has to read the body - the dev server does not
 * compress, but a user's own server might. The injected reporter covers uncaught errors, unhandled rejections and the
 * dev server's compile-error overlay, which is where a syntax error the AI wrote shows up and which never reaches the
 * usual error handler.
 */
const http = require('http');
const httpProxy = require('http-proxy');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://redis-service:6379';
const port = Number(process.env.PORT || 80);
const SEEN_TTL_SECONDS = 24 * 60 * 60;
const SEEN_WRITE_EVERY_MS = 15_000;
const REDIS_MAX_RETRIES = 2;
const REDIS_COMMAND_TIMEOUT_MS = 2_000;
const MAX_TRACKED_HOSTNAMES = 5_000;

const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: REDIS_MAX_RETRIES,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    enableReadyCheck: false,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        console.log(`Redis connection failed. Retrying in ${delay}ms...`);
        return delay;
    }
});

redis.on('error', (err) => console.error('Redis Client Error:', err.message));
redis.on('connect', () => console.log('Connected to Redis'));

const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true, changeOrigin: true });

const htmlProxy = httpProxy.createProxyServer({ xfwd: true, changeOrigin: true, selfHandleResponse: true });

htmlProxy.on('proxyReq', (proxyReq) => proxyReq.setHeader('accept-encoding', 'identity'));

htmlProxy.on('proxyRes', (proxyRes, req, res) => {
    const type = String(proxyRes.headers['content-type'] || '');
    if (!type.includes('text/html')) {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
        return;
    }
    const chunks = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
        const body = injectReporter(Buffer.concat(chunks).toString('utf8'));
        const headers = { ...proxyRes.headers };
        delete headers['content-length'];
        delete headers['content-encoding'];
        headers['content-length'] = Buffer.byteLength(body);
        res.writeHead(proxyRes.statusCode, headers);
        res.end(body);
    });
});

async function getTarget(hostname) {
    try {
        return await redis.get(`route:${hostname}`);
    } catch (err) {
        console.error('Redis Error:', err.message);
        return null;
    }
}

const lastSeenWrite = new Map();

function recordVisit(hostname) {
    const now = Date.now();
    if (now - (lastSeenWrite.get(hostname) || 0) < SEEN_WRITE_EVERY_MS) return;
    if (lastSeenWrite.size >= MAX_TRACKED_HOSTNAMES) {
        for (const [host, at] of lastSeenWrite) {
            if (now - at > SEEN_WRITE_EVERY_MS) lastSeenWrite.delete(host);
        }
        if (lastSeenWrite.size >= MAX_TRACKED_HOSTNAMES) lastSeenWrite.clear();
    }
    lastSeenWrite.set(hostname, now);
    redis.set(`seen:${hostname}`, String(now), 'EX', SEEN_TTL_SECONDS).catch(() => {});
}

const getTargetUrl = (target) => (target.includes(':') ? `http://${target}` : `http://${target}:5173`);

const isPageLoad = (req) => req.method === 'GET' && String(req.headers.accept || '').includes('text/html');

const REPORTER = `<script>(function () {
  if (window.parent === window) return;
  var sent = {};
  function post(type, subType, payload) {
    try { window.parent.postMessage({ type: type, subType: subType, payload: payload }, '*'); } catch (e) {}
  }
  function report(subType, payload) {
    var key = subType + '|' + payload.message;
    if (sent[key]) return;
    sent[key] = true;
    post('PreviewError', subType, payload);
  }
  window.addEventListener('error', function (e) {
    if (!e.message) return;
    report('Runtime error', { message: e.message, stack: e.error && e.error.stack, source: e.filename, lineno: e.lineno, colno: e.colno });
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason || {};
    report('Unhandled promise rejection', { message: String(r.message || r), stack: r.stack });
  });
  function checkOverlay(node) {
    if (!node || node.tagName !== 'VITE-ERROR-OVERLAY' || !node.shadowRoot) return;
    var root = node.shadowRoot;
    var text = function (sel) { var el = root.querySelector(sel); return el ? el.textContent.trim() : undefined; };
    report('Build error', { message: text('.message') || 'Build failed', stack: text('.frame') || text('.stack'), source: text('.file') });
  }
  new MutationObserver(function (records) {
    records.forEach(function (r) { r.addedNodes.forEach(checkOverlay); });
  }).observe(document.documentElement, { childList: true, subtree: true });
  function location() { post('PreviewLocation', null, { path: window.location.pathname + window.location.search + window.location.hash }); }
  ['pushState', 'replaceState'].forEach(function (name) {
    var original = history[name];
    history[name] = function () { var result = original.apply(this, arguments); location(); return result; };
  });
  window.addEventListener('popstate', location);
  window.addEventListener('hashchange', location);
  location();
})();</script>`;

function injectReporter(html) {
    const head = html.search(/<head[^>]*>/i);
    if (head === -1) return REPORTER + html;
    const end = html.indexOf('>', head) + 1;
    return html.slice(0, end) + REPORTER + html.slice(end);
}

function statusPage(res, status, title, message, { refreshSeconds } = {}) {
    if (res.headersSent) return res.end();
    const refresh = refreshSeconds ? `<meta http-equiv="refresh" content="${refreshSeconds}">` : '';
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${refresh}
<title>${title}</title><style>
  :root { color-scheme: light dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font: 14px/1.5 system-ui, sans-serif;
         background: Canvas; color: CanvasText; }
  main { max-width: 360px; padding: 24px; text-align: center; }
  h1 { font-size: 16px; font-weight: 600; margin: 0 0 6px; }
  p { margin: 0; opacity: .7; }
</style></head><body><main><h1>${title}</h1><p>${message}</p></main></body></html>`);
}

const server = http.createServer(async (req, res) => {
    const hostname = (req.headers.host || '').split(':')[0];
    const target = await getTarget(hostname);

    if (!target) {
        return statusPage(res, 404, "This preview isn't running",
            'Open the project in VibeCraft and switch to Preview to start it.');
    }

    if (isPageLoad(req)) recordVisit(hostname);

    const onError = (e) => {
        console.error(`Proxy error for ${hostname}:`, e.message);
        statusPage(res, 502, 'The preview is restarting', 'This page will reload in a moment.', { refreshSeconds: 3 });
    };

    if (isPageLoad(req)) {
        htmlProxy.web(req, res, { target: getTargetUrl(target) }, onError);
    } else {
        proxy.web(req, res, { target: getTargetUrl(target) }, onError);
    }
});

server.on('upgrade', async (req, socket, head) => {
    const hostname = (req.headers.host || '').split(':')[0];
    const target = await getTarget(hostname);
    if (!target) return socket.destroy();

    proxy.ws(req, socket, head, { target: getTargetUrl(target) }, (e) => {
        console.error(`Proxy error (ws) for ${hostname}:`, e.message);
        socket.destroy();
    });
});

server.listen(port, () => console.log(`Preview proxy listening on port ${port}`));
