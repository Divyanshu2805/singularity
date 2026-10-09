/**
 * Covers proxy/published.js: which hostnames are published apps, which request paths are refused, which files a path
 * maps to, the content type and caching of each, the headers every response carries, the pointer's accepted shape and
 * the mark added to a page. Most cases are the ones an attacker would try: a path that climbs out of the build, a link
 * name that is the product's own word or looks like a preview, a pointer that names another app's files.
 */
const test = require('node:test');
const assert = require('node:assert');
const {
    publishedSlug, isValidSlug, isPreviewHostname, pathSegments, candidatesFor, contentTypeFor, cacheControlFor,
    securityHeaders, parsePointer, injectBadge,
} = require('./published');

const DOMAIN = 'apps.example.dev';

test('a published app is one label under the domain', () => {
    assert.strictEqual(publishedSlug('my-todo-ab12.apps.example.dev', DOMAIN), 'my-todo-ab12');
    assert.strictEqual(publishedSlug('My-Todo-AB12.apps.example.dev:8090', DOMAIN), 'my-todo-ab12');
});

test('a host that is not under the domain, or is the domain itself, is not a published app', () => {
    assert.strictEqual(publishedSlug('my-todo-ab12.other.dev', DOMAIN), null);
    assert.strictEqual(publishedSlug('apps.example.dev', DOMAIN), null);
    assert.strictEqual(publishedSlug('evil-apps.example.dev.attacker.net', DOMAIN), null);
    assert.strictEqual(publishedSlug('my-todo-ab12.apps.example.dev', ''), null);
    assert.strictEqual(publishedSlug(undefined, DOMAIN), null);
});

test('a preview hostname is never a published app, whatever the domain', () => {
    assert.strictEqual(publishedSlug('p12-abcdefghij.apps.example.dev', DOMAIN), null);
    assert.strictEqual(isPreviewHostname('p12-abcdefghij.localhost'), true);
    assert.strictEqual(isPreviewHostname('my-app-ab12.localhost'), false);
});

test('a name with more than one label, or an invalid one, is not looked up', () => {
    for (const host of ['a.b-cd.apps.example.dev', '-bad.apps.example.dev', 'bad-.apps.example.dev', 'a--b.apps.example.dev',
        'xn--abc.apps.example.dev', 'ab.apps.example.dev', `${'x'.repeat(41)}.apps.example.dev`, 'under_score.apps.example.dev']) {
        assert.strictEqual(publishedSlug(host, DOMAIN), null, host);
    }
});

test('the product\'s own words are not published apps', () => {
    for (const word of ['www', 'api', 'singularity', 'vibecraft', 'admin', 'login']) {
        assert.strictEqual(isValidSlug(word), false, word);
        assert.strictEqual(publishedSlug(`${word}.${DOMAIN}`, DOMAIN), null, word);
    }
});

test('the root and plain paths map to the files to try, in order', () => {
    assert.deepStrictEqual(candidatesFor(pathSegments('/')), [{ key: 'index.html', fallback: false }]);
    assert.deepStrictEqual(candidatesFor(pathSegments('/assets/app-1a2b3c4d.js')), [{ key: 'assets/app-1a2b3c4d.js', fallback: false }]);
});

test('a route of the app falls back to index.html, so a refresh on any page works', () => {
    assert.deepStrictEqual(candidatesFor(pathSegments('/dashboard/settings')), [
        { key: 'dashboard/settings', fallback: false },
        { key: 'dashboard/settings.html', fallback: false },
        { key: 'dashboard/settings/index.html', fallback: false },
        { key: 'index.html', fallback: true },
    ]);
    assert.deepStrictEqual(candidatesFor(pathSegments('/about/')), [
        { key: 'about/index.html', fallback: false },
        { key: 'index.html', fallback: true },
    ]);
});

test('a missing file with an extension has no fallback, so a missing image is a 404 and not a blank page', () => {
    assert.strictEqual(candidatesFor(pathSegments('/img/logo.png')).some((c) => c.fallback), false);
    assert.strictEqual(candidatesFor(pathSegments('/favicon.ico')).some((c) => c.fallback), false);
});

test('the query string and fragment are not part of the path', () => {
    assert.deepStrictEqual(candidatesFor(pathSegments('/app.js?v=3#x')), [{ key: 'app.js', fallback: false }]);
});

test('a path that tries to climb out of the build is refused, however it is spelled', () => {
    for (const url of ['/../x', '/a/../../x', '/%2e%2e/x', '/%2E%2E/x', '/a/%2e%2e/b', '/./x', '/a\\b', '/a%5Cb', '/a%00b',
        '/a%0Ab', '/%2e%2e/%2e%2e/x', 'no-leading-slash', '/%E0%A4%A']) {
        assert.strictEqual(pathSegments(url), null, url);
    }
});

test('a double-encoded dot segment stays a plain name, since a path is decoded exactly once', () => {
    const parsed = pathSegments('/%252e%252e/x');
    assert.deepStrictEqual(parsed.segments, ['%2e%2e', 'x']);
});

test('repeated slashes collapse and cannot name another app or the sources', () => {
    assert.deepStrictEqual(pathSegments('//a///b').segments, ['a', 'b']);
    const keys = candidatesFor(pathSegments('/src/App.tsx')).map((c) => c.key);
    assert.deepStrictEqual(keys, ['src/App.tsx']);
});

test('content types come from a fixed table; an unknown extension is an opaque download', () => {
    assert.strictEqual(contentTypeFor('index.html'), 'text/html; charset=utf-8');
    assert.strictEqual(contentTypeFor('assets/app-1a2b3c4d.js'), 'text/javascript; charset=utf-8');
    assert.strictEqual(contentTypeFor('a.css'), 'text/css; charset=utf-8');
    assert.strictEqual(contentTypeFor('a.svg'), 'image/svg+xml');
    assert.strictEqual(contentTypeFor('a.woff2'), 'font/woff2');
    assert.strictEqual(contentTypeFor('a.wasm'), 'application/wasm');
    assert.strictEqual(contentTypeFor('a.exe'), 'application/octet-stream');
    assert.strictEqual(contentTypeFor('noextension'), 'application/octet-stream');
    assert.strictEqual(contentTypeFor('A.HTML'), 'text/html; charset=utf-8');
});

test('hashed bundler output is cached for good and everything else is checked each time', () => {
    assert.strictEqual(cacheControlFor('assets/index-DxK3a9Zq.js'), 'public, max-age=31536000, immutable');
    assert.strictEqual(cacheControlFor('assets/logo-4f8a9c2e1b.png'), 'public, max-age=31536000, immutable');
    assert.strictEqual(cacheControlFor('index.html'), 'no-cache');
    assert.strictEqual(cacheControlFor('assets/plain.js'), 'no-cache');
    assert.strictEqual(cacheControlFor('favicon.ico'), 'no-cache');
});

test('every published response carries the strict headers, and never sets a cookie', () => {
    const headers = securityHeaders({ frameAncestors: 'https://app.example.dev', https: true });

    assert.match(headers['Content-Security-Policy'], /script-src 'self'/);
    assert.doesNotMatch(headers['Content-Security-Policy'], /script-src[^;]*unsafe-inline/);
    assert.match(headers['Content-Security-Policy'], /object-src 'none'/);
    assert.match(headers['Content-Security-Policy'], /base-uri 'self'/);
    assert.match(headers['Content-Security-Policy'], /frame-ancestors https:\/\/app\.example\.dev/);
    assert.strictEqual(headers['X-Content-Type-Options'], 'nosniff');
    assert.strictEqual(headers['Referrer-Policy'], 'no-referrer');
    assert.match(headers['Permissions-Policy'], /camera=\(\)/);
    assert.match(headers['X-Robots-Tag'], /noindex/);
    assert.ok(headers['Strict-Transport-Security']);
    assert.strictEqual(Object.keys(headers).some((name) => name.toLowerCase() === 'set-cookie'), false);
});

test('with no frame ancestors given, nothing may frame a published page; HSTS only over https', () => {
    const headers = securityHeaders({});

    assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
    assert.strictEqual(headers['Strict-Transport-Security'], undefined);
});

test('a pointer is accepted only in the shape workspace-service writes', () => {
    assert.deepStrictEqual(parsePointer(Buffer.from('{"v":1,"prefix":"b12/site/","build":12}')), { prefix: 'b12/site/' });
    for (const bad of ['{"prefix":"../other/b1/site/"}', '{"prefix":"b1/src/"}', '{"prefix":"b1/site/../"}', '{"prefix":7}',
        '{}', 'not json', '', '{"prefix":"B1/site/"}', '{"prefix":"b1/site"}']) {
        assert.strictEqual(parsePointer(Buffer.from(bad)), null, bad);
    }
});

test('the mark goes in before the closing body tag, and cannot be removed by the page', () => {
    const marked = injectBadge('<html><body><h1>Hi</h1></body></html>', 'https://app.example.dev/');

    assert.match(marked, /<h1>Hi<\/h1><a href="https:\/\/app\.example\.dev\/"[^>]*>Built with Singularity<\/a><\/body><\/html>/);
});

test('a page with no closing body tag gets the mark at the end, and a hostile app url is escaped', () => {
    const marked = injectBadge('<p>bare</p>', 'https://x/"><script>alert(1)</script>');

    assert.ok(marked.startsWith('<p>bare</p><a '));
    assert.ok(!marked.toLowerCase().includes('<script'));
});

test('only the last closing body tag is used', () => {
    const marked = injectBadge('<body>a</body><!-- </body> --></body>', 'https://x/');

    assert.strictEqual((marked.match(/Built with Singularity/g) || []).length, 1);
    assert.ok(marked.endsWith('</body>'));
});
