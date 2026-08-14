/**
 * The preview proxy: routes every preview hostname to the runner pod serving it, to whoever presents a valid access
 * token for that hostname.
 *
 * Handles: looking a hostname's route up in Redis, verifying the signed access token workspace-service appended to
 * the preview URL (CODE_REVIEW.md SEC-06) before proxying either HTTP or websockets to that pod, recording that a
 * preview was visited, rewriting a page load's HTML on the way out to inject the runtime-error reporter, and serving
 * a readable page when there is no route, no valid token, or the runner does not answer.
 *
 * Without the token check, a preview's hostname alone is a permanent, unauthenticated bearer link: this proxy has no
 * concept of project membership, so anyone who ever saw the URL - including a member later removed from the project
 * - kept working access forever. verifyToken re-implements PreviewAccessToken.java's exact HMAC-SHA256 scheme so
 * this stays a fully stateless check with no database or session store of its own; the two must stay byte-for-byte
 * identical (see PreviewAccessTokenTest's cross-language contract test) or every link starts failing.
 *
 * The token arrives once, as a query parameter, on the first page load; a valid one is exchanged for a cookie
 * (`SameSite=None` because previews are shown in a cross-site iframe from the main app, which browsers otherwise
 * refuse to attach a cookie to) and the URL is redirected to drop the token from the address bar, browser history
 * and any outbound Referer. Every later request - including the websocket upgrade - is authorized by that cookie
 * alone, re-verified statelessly on every single request rather than looked up anywhere, so the token's own expiry
 * (`preview.access-token-ttl`) is what actually bounds how long a removed member's already-open tab keeps working:
 * there is nothing to push a revocation to.
 *
 * The backend writes the route key once a preview's dev server answers and removes it when the preview stops; this
 * writes the last-seen key as pages load, which is how the backend's idle reaper knows a preview open in its own tab
 * is still in use. Keep both key names in step with the backend's router - nothing else ties the two together.
 *
 * Redis waits are bounded on purpose (CODE_REVIEW.md PRE-08): an unlimited command queue turns an outage into
 * requests that hang forever rather than failing, and the last-seen map is swept so a long-lived process cannot
 * accumulate one entry per hostname it has ever served. A Redis error and a genuinely missing route are told apart
 * (routing.js's ROUTER_UNAVAILABLE) so an outage shows "try again" rather than "this preview isn't running" - the
 * latter is what a visitor sees when their own preview was never started, which a Redis hiccup is not. Waiting on
 * the runner pod itself is bounded too: a pod at "Running" whose dev server has died or wedged (PRE-06) must fail a
 * request the same way an unreachable one does, not hang until the client gives up - proxyTimeout covers the plain
 * HTTP passes, and the manual proxyReqWs timer covers the websocket pass, which http-proxy never times out itself.
 *
 * The HTML rewrite asks for an uncompressed response, since it has to read the body - the dev server does not
 * compress, but a user's own server might. The injected reporter covers uncaught errors, unhandled rejections and the
 * dev server's compile-error overlay, which is where a syntax error the AI wrote shows up and which never reaches the
 * usual error handler.
 */
const http = require('http');
const { URL } = require('url');
const httpProxy = require('http-proxy');
const Redis = require('ioredis');
const { verifyToken, readCookie, accessCookieHeader, ACCESS_COOKIE_NAME, TOKEN_QUERY_PARAM } = require('./auth');
const { ROUTER_UNAVAILABLE, classifyMissingRoute } = require('./routing');

const redisUrl = process.env.REDIS_URL || 'redis://redis-service:6379';
const port = Number(process.env.PORT || 80);
const SEEN_TTL_SECONDS = 24 * 60 * 60;
const SEEN_WRITE_EVERY_MS = 15_000;
const REDIS_MAX_RETRIES = 2;
const REDIS_COMMAND_TIMEOUT_MS = 2_000;
const MAX_TRACKED_HOSTNAMES = 5_000;
// How long to wait for the runner pod itself to respond, once Redis has told us where it is. A pod stuck at
// "Running" with a dead or hung dev server inside it (CODE_REVIEW.md PRE-06) must not hang a request forever - it
// should fail the same way an unreachable pod does.
const UPSTREAM_TIMEOUT_MS = Number(process.env.PREVIEW_UPSTREAM_TIMEOUT_MS || 15_000);
const WS_HANDSHAKE_TIMEOUT_MS = Number(process.env.PREVIEW_WS_HANDSHAKE_TIMEOUT_MS || 10_000);

const ACCESS_TOKEN_SECRET = process.env.PREVIEW_ACCESS_TOKEN_SECRET;
// `.localhost` is treated as a potentially-trustworthy origin by every major browser even over plain http, which is
// exactly why this project picked it as the local-dev preview domain (see PreviewProperties) - Secure cookies work
// there without TLS. A real deployment needs an actual HTTPS-terminated domain for this cookie to ever be set;
// that's OPS-01's job, not this proxy's.
if (!ACCESS_TOKEN_SECRET) {
    console.error('PREVIEW_ACCESS_TOKEN_SECRET is not set - every preview request will be refused rather than served unauthenticated');
}

function isAuthorized(req, hostname) {
    return verifyToken(ACCESS_TOKEN_SECRET, hostname, readCookie(req.headers.cookie, ACCESS_COOKIE_NAME));
}

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

const proxy = httpProxy.createProxyServer({ ws: true, xfwd: true, changeOrigin: true, proxyTimeout: UPSTREAM_TIMEOUT_MS });

const htmlProxy = httpProxy.createProxyServer({
    xfwd: true, changeOrigin: true, selfHandleResponse: true, proxyTimeout: UPSTREAM_TIMEOUT_MS,
});

// http-proxy's proxyTimeout only guards the plain HTTP passes; its websocket pass never times out an upstream that
// accepts the TCP connection but never completes the upgrade handshake (Vite's HMR socket, wedged). Time that out by
// hand and destroy both ends, the same failure shape as any other unreachable-upstream error.
proxy.on('proxyReqWs', (proxyReq, req, socket) => {
    const timer = setTimeout(() => {
        console.error(`Preview websocket upgrade for ${req.headers.host || 'unknown host'} timed out waiting for the runner`);
        proxyReq.destroy();
        socket.destroy();
    }, WS_HANDSHAKE_TIMEOUT_MS);
    const clear = () => clearTimeout(timer);
    proxyReq.once('response', clear);
    proxyReq.once('upgrade', clear);
    proxyReq.once('error', clear);
    socket.once('close', clear);
});

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
        return ROUTER_UNAVAILABLE;
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

    if (!target || target === ROUTER_UNAVAILABLE) {
        const page = classifyMissingRoute(target);
        return statusPage(res, page.status, page.title, page.message, { refreshSeconds: page.refreshSeconds });
    }

    const requestUrl = new URL(req.url, `http://${hostname}`);
    const queryToken = requestUrl.searchParams.get(TOKEN_QUERY_PARAM);
    if (queryToken && verifyToken(ACCESS_TOKEN_SECRET, hostname, queryToken)) {
        // Exchange the one-time URL token for a cookie, then redirect it away so it never sits in the address bar,
        // browser history or an outbound Referer header from whatever the generated app links out to.
        requestUrl.searchParams.delete(TOKEN_QUERY_PARAM);
        res.writeHead(302, {
            Location: requestUrl.pathname + requestUrl.search + requestUrl.hash || '/',
            'Set-Cookie': accessCookieHeader(queryToken),
            'Cache-Control': 'no-store',
        });
        return res.end();
    }

    if (!isAuthorized(req, hostname)) {
        return statusPage(res, 401, "This preview link isn't valid",
            'Reopen the project and switch to Preview again to get a fresh link.');
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
    if (target === ROUTER_UNAVAILABLE) console.error(`Refusing a websocket upgrade for ${hostname}: the router (Redis) didn't answer`);
    if (!target || target === ROUTER_UNAVAILABLE) return socket.destroy();

    if (!isAuthorized(req, hostname)) {
        socket.destroy();
        return;
    }

    proxy.ws(req, socket, head, { target: getTargetUrl(target) }, (e) => {
        console.error(`Proxy error (ws) for ${hostname}:`, e.message);
        socket.destroy();
    });
});

server.listen(port, () => console.log(`Preview proxy listening on port ${port}`));
