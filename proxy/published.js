/**
 * The rules for serving a published app, pulled out of the handler so they can be tested without a server or storage.
 *
 * Handles: telling a published app's hostname from a preview's and pulling the link name out of it, turning a request's
 * path into the storage paths to try (and refusing any that climb out of the app), the content type and caching of each
 * kind of file, the strict headers every published response carries, reading the pointer that says which build is live,
 * adding the "Built with Singularity" mark to a page, and the small pages shown when an app is not published, a file
 * is missing or storage does not answer.
 *
 * A published app is someone's code on a public address under the product's domain, so most of this file is a boundary.
 * The link name is checked here against the same rules workspace-service enforces when it is chosen (PublishedSlug.java),
 * because a hostname is attacker-chosen input: a request for anything that is not a plain label under the domain is
 * not looked up at all. A path is decoded once, refused if it holds a dot segment, a backslash, a NUL or any control
 * character, and joined to the build's prefix only after that - so no request can name a key outside the build it
 * asked for, such as another app's or the sources stored beside the site. The content type comes from the file's
 * extension in a fixed table, never from what storage holds, and a file with an unknown extension is served as an opaque
 * download with nosniff, so an upload cannot choose to be a page.
 */
const MAX_SLUG = 40;
const MIN_SLUG = 3;
const LABEL = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const PREVIEW_HOST = /^p\d+-/;
const RESERVED = new Set([
    'www', 'api', 'app', 'apps', 'admin', 'administrator', 'assets', 'static', 'cdn', 'media', 'files',
    'mail', 'email', 'smtp', 'imap', 'ftp', 'ns1', 'ns2', 'dns', 'mx',
    'login', 'signin', 'signup', 'register', 'auth', 'oauth', 'sso', 'account', 'accounts', 'billing', 'pay',
    'payment', 'payments', 'checkout', 'support', 'help', 'status', 'docs', 'blog', 'dashboard', 'console',
    'singularity', 'vibecraft', 'preview', 'previews', 'publish', 'published', 'proxy', 'gateway',
    'internal', 'staging', 'stage', 'test', 'testing', 'dev', 'prod', 'production', 'localhost', 'root',
    'security', 'abuse', 'about', 'terms', 'privacy', 'legal', 'share', 'shared', 'embed', 'download',
]);

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const POINTER_PREFIX = /^b\d{1,12}\/site\/$/;

const CONTENT_TYPES = {
    html: 'text/html; charset=utf-8',
    htm: 'text/html; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    mjs: 'text/javascript; charset=utf-8',
    css: 'text/css; charset=utf-8',
    json: 'application/json; charset=utf-8',
    map: 'application/json; charset=utf-8',
    webmanifest: 'application/manifest+json; charset=utf-8',
    txt: 'text/plain; charset=utf-8',
    xml: 'application/xml; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    eot: 'application/vnd.ms-fontobject',
    wasm: 'application/wasm',
    mp4: 'video/mp4',
    webm: 'video/webm',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
};

function hostWithoutPort(host) {
    return String(host || '').split(':')[0].toLowerCase();
}

function isPreviewHostname(hostname) {
    return PREVIEW_HOST.test(String(hostname || '').toLowerCase());
}

function isValidSlug(slug) {
    return typeof slug === 'string'
        && slug.length >= MIN_SLUG && slug.length <= MAX_SLUG
        && LABEL.test(slug) && !slug.includes('--')
        && !RESERVED.has(slug) && !PREVIEW_HOST.test(slug);
}

/** The link name a request's Host names, or null when the host is not a published app's. */
function publishedSlug(hostHeader, domain) {
    if (!domain) return null;
    const hostname = hostWithoutPort(hostHeader);
    const suffix = '.' + String(domain).toLowerCase();
    if (!hostname.endsWith(suffix)) return null;
    const slug = hostname.slice(0, hostname.length - suffix.length);
    return isValidSlug(slug) ? slug : null;
}

/**
 * The path part of a request URL as a list of segments, or null when it must be refused. Decoded once; a dot segment,
 * a backslash, a NUL or a control character anywhere in it refuses the request.
 */
function pathSegments(requestUrl) {
    let raw = String(requestUrl || '/');
    const cut = raw.search(/[?#]/);
    if (cut >= 0) raw = raw.slice(0, cut);
    if (!raw.startsWith('/')) return null;
    let decoded;
    try {
        decoded = decodeURIComponent(raw);
    } catch {
        return null;
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(decoded)) return null;
    const segments = decoded.split('/').slice(1);
    const trailingSlash = segments.length > 0 && segments[segments.length - 1] === '';
    const clean = [];
    for (const segment of segments) {
        if (segment === '') continue;
        if (segment === '.' || segment === '..') return null;
        clean.push(segment);
    }
    return { segments: clean, trailingSlash };
}

function extensionOf(name) {
    const dot = name.lastIndexOf('.');
    return dot > 0 && dot < name.length - 1 ? name.slice(dot + 1).toLowerCase() : '';
}

/**
 * The files to try, in order, for a request. Each is { key, fallback }: the key relative to the build, and whether it is
 * the single-page fallback (index.html answering for a route that is not a file). A path whose last segment has an
 * extension is a file and has no fallback - a missing image is a 404, not a blank page.
 */
function candidatesFor(parsed) {
    if (!parsed) return [];
    const { segments, trailingSlash } = parsed;
    if (segments.length === 0) return [{ key: 'index.html', fallback: false }];
    const joined = segments.join('/');
    if (trailingSlash) return [{ key: joined + '/index.html', fallback: false }, { key: 'index.html', fallback: true }];
    if (extensionOf(segments[segments.length - 1])) return [{ key: joined, fallback: false }];
    return [
        { key: joined, fallback: false },
        { key: joined + '.html', fallback: false },
        { key: joined + '/index.html', fallback: false },
        { key: 'index.html', fallback: true },
    ];
}

function contentTypeFor(key) {
    return CONTENT_TYPES[extensionOf(key)] || 'application/octet-stream';
}

function isHtmlKey(key) {
    const ext = extensionOf(key);
    return ext === 'html' || ext === 'htm';
}

const HASHED_ASSET = /^assets\/.+-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/;

/** Hashed bundler output never changes, so it is cached for good; everything else is checked on every use. */
function cacheControlFor(key) {
    return HASHED_ASSET.test(key) ? 'public, max-age=31536000, immutable' : 'no-cache';
}

function contentSecurityPolicy(frameAncestors) {
    return [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src * data: blob:",
        "font-src * data:",
        "media-src * data: blob:",
        "connect-src *",
        "frame-src *",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${frameAncestors || "'none'"}`,
    ].join('; ');
}

/** Headers on every published response, success or error. Never a Set-Cookie: a published page has no session. */
function securityHeaders(options = {}) {
    const headers = {
        'Content-Security-Policy': contentSecurityPolicy(options.frameAncestors),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'Cross-Origin-Opener-Policy': 'same-origin',
        'X-Robots-Tag': 'noindex, nofollow',
    };
    if (options.https) headers['Strict-Transport-Security'] = 'max-age=31536000';
    return headers;
}

/** The pointer's prefix, or null when the pointer is not one workspace-service wrote. */
function parsePointer(buffer) {
    try {
        const pointer = JSON.parse(Buffer.from(buffer).toString('utf8'));
        if (pointer && typeof pointer.prefix === 'string' && POINTER_PREFIX.test(pointer.prefix)) {
            return { prefix: pointer.prefix };
        }
    } catch {
        return null;
    }
    return null;
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function badgeHtml(appUrl) {
    const href = escapeHtml(appUrl || 'https://singularity.divyanshuagrahari.dev/');
    return '<a href="' + href + '" target="_blank" rel="noopener" data-singularity-badge '
        + 'style="position:fixed;right:12px;bottom:12px;z-index:2147483647;font:500 12px/1 system-ui,-apple-system,sans-serif;'
        + 'color:#fff;background:rgba(15,15,20,.84);padding:8px 11px;border-radius:999px;text-decoration:none;'
        + 'box-shadow:0 2px 10px rgba(0,0,0,.3)">Built with Singularity</a>';
}

/** Adds the mark just before the closing body tag (or at the end of a page that has none). */
function injectBadge(html, appUrl) {
    const badge = badgeHtml(appUrl);
    const index = html.toLowerCase().lastIndexOf('</body>');
    return index >= 0 ? html.slice(0, index) + badge + html.slice(index) : html + badge;
}

function pageHtml(title, message) {
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
        + '<meta name="robots" content="noindex"><title>' + escapeHtml(title) + '</title>'
        + '<style>html,body{height:100%;margin:0}body{display:flex;align-items:center;justify-content:center;background:#0b0b10;'
        + 'color:#e8e8ee;font:16px/1.5 system-ui,-apple-system,sans-serif;text-align:center;padding:24px;box-sizing:border-box}'
        + 'main{max-width:30rem}h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#a0a0ad}</style></head>'
        + '<body><main><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(message) + '</p></main></body></html>';
}

const PAGES = {
    notPublished: { status: 404, title: "This app isn't published", message: 'The link may be wrong, or its owner has taken the app down.' },
    notFound: { status: 404, title: 'Page not found', message: "This app has no file at that address." },
    unavailable: { status: 503, title: 'This app is temporarily unavailable', message: 'Try again in a moment.' },
    badRequest: { status: 400, title: "That address isn't valid", message: 'Check the link and try again.' },
};

module.exports = {
    MAX_HTML_BYTES,
    isPreviewHostname,
    isValidSlug,
    publishedSlug,
    pathSegments,
    candidatesFor,
    contentTypeFor,
    isHtmlKey,
    cacheControlFor,
    contentSecurityPolicy,
    securityHeaders,
    parsePointer,
    injectBadge,
    badgeHtml,
    pageHtml,
    PAGES,
};
