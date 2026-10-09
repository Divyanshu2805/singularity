/**
 * Covers proxy/published-server.js through a real HTTP server and a stand-in store that answers the way MinIO does:
 * what an app serves (the page, files with their type and caching, a route of the app, conditional requests), what it
 * refuses (the sources beside the site, other apps, hostile paths, other methods), how an app that is not published, a
 * missing file and storage being down each look, and that taking an app down or updating it is seen without a restart.
 */
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { Readable } = require('stream');
const { createPublishedHandler } = require('./published-server');

const BUCKET = 'published-apps';

/** A store holding objects in memory, counting reads, that answers the way MinIO does. */
function fakeStore(objects) {
    const reads = [];
    return {
        reads,
        objects,
        async get(bucket, key, options = {}) {
            reads.push(key);
            assert.strictEqual(bucket, BUCKET);
            if (objects.__down) throw new Error('connect ECONNREFUSED');
            if (objects.__status) return { status: objects.__status, headers: {}, stream: Readable.from([]) };
            const body = objects[key];
            if (body === undefined) return { status: 404, headers: {}, stream: Readable.from([]) };
            const buffer = Buffer.from(body);
            const etag = '"' + buffer.length + '"';
            if (options.ifNoneMatch && options.ifNoneMatch === etag) return { status: 304, headers: { etag }, stream: Readable.from([]) };
            return {
                status: 200,
                headers: { etag, 'content-length': String(buffer.length), 'accept-ranges': 'bytes' },
                stream: Readable.from([buffer]),
            };
        },
    };
}

const POINTER = '{"v":1,"prefix":"b3/site/","build":3}';

function build(extra = {}) {
    return {
        'demo-ab12/current.json': POINTER,
        'demo-ab12/b3/site/index.html': '<html><body><div id="root"></div></body></html>',
        'demo-ab12/b3/site/assets/index-DxK3a9Zq.js': 'console.log("app")',
        'demo-ab12/b3/site/assets/app.css': 'body{margin:0}',
        'demo-ab12/b3/site/about.html': '<html><body>about</body></html>',
        'demo-ab12/b3/src/App.tsx': 'SECRET SOURCE',
        'other-app/current.json': '{"prefix":"b1/site/"}',
        'other-app/b1/site/index.html': '<html>other</html>',
        ...extra,
    };
}

async function serve(store, options = {}) {
    let clock = 1_000_000;
    const handler = createPublishedHandler({
        store, bucket: BUCKET, appUrl: 'https://app.example.dev/', frameAncestors: 'https://app.example.dev',
        now: () => clock, ...options,
    });
    const server = http.createServer((req, res) => handler(req, res, 'demo-ab12'));
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    return {
        base,
        advance: (ms) => { clock += ms; },
        close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }),
        get: (path, init) => fetch(base + path, { redirect: 'manual', ...init }),
    };
}

test('the root serves index.html with the mark added, uncacheable and with the strict headers', async () => {
    const app = await serve(fakeStore(build()));
    try {
        const res = await app.get('/');
        const body = await res.text();

        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.headers.get('content-type'), 'text/html; charset=utf-8');
        assert.match(body, /<div id="root"><\/div><a href="https:\/\/app\.example\.dev\/"/);
        assert.match(body, /Built with Singularity/);
        assert.strictEqual(res.headers.get('cache-control'), 'no-cache');
        assert.strictEqual(res.headers.get('content-length'), String(Buffer.byteLength(body)));
        assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
        assert.strictEqual(res.headers.get('x-content-type-options'), 'nosniff');
        assert.strictEqual(res.headers.get('set-cookie'), null);
    } finally {
        await app.close();
    }
});

test('a file is served with its type, its etag and, when hashed, a cache that never expires', async () => {
    const app = await serve(fakeStore(build()));
    try {
        const js = await app.get('/assets/index-DxK3a9Zq.js');
        assert.strictEqual(js.status, 200);
        assert.strictEqual(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
        assert.strictEqual(js.headers.get('cache-control'), 'public, max-age=31536000, immutable');
        assert.strictEqual(await js.text(), 'console.log("app")');

        const css = await app.get('/assets/app.css');
        assert.strictEqual(css.headers.get('content-type'), 'text/css; charset=utf-8');
        assert.strictEqual(css.headers.get('cache-control'), 'no-cache');
        assert.ok(css.headers.get('etag'));
    } finally {
        await app.close();
    }
});

test('a conditional request for an unchanged file is answered 304 from storage', async () => {
    const app = await serve(fakeStore(build()));
    try {
        const first = await app.get('/assets/app.css');
        const second = await app.get('/assets/app.css', { headers: { 'If-None-Match': first.headers.get('etag') } });

        assert.strictEqual(second.status, 304);
        assert.strictEqual(await second.text(), '');
    } finally {
        await app.close();
    }
});

test('a refresh on any route of the app gets index.html, and about.html is found without its extension', async () => {
    const app = await serve(fakeStore(build()));
    try {
        const route = await app.get('/dashboard/settings');
        assert.strictEqual(route.status, 200);
        assert.match(await route.text(), /<div id="root">/);

        const about = await app.get('/about');
        assert.match(await about.text(), /about/);
    } finally {
        await app.close();
    }
});

test('a missing file with an extension is a 404 page, not the app', async () => {
    const app = await serve(fakeStore(build()));
    try {
        const res = await app.get('/img/missing.png');

        assert.strictEqual(res.status, 404);
        assert.doesNotMatch(await res.text(), /<div id="root">/);
        assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
    } finally {
        await app.close();
    }
});

test('the sources stored beside the site and other apps are unreachable, however the path is written', async () => {
    const store = fakeStore(build());
    const app = await serve(store);
    try {
        for (const path of ['/../src/App.tsx', '/%2e%2e/src/App.tsx', '/src/App.tsx', '/../../other-app/b1/site/index.html',
            '/..%2f..%2fother-app/b1/site/index.html', '/assets/..%5c..%5csrc/App.tsx']) {
            const res = await app.get(path);
            const body = await res.text();
            assert.doesNotMatch(body, /SECRET SOURCE/, path);
            assert.doesNotMatch(body, /other<\/html>/, path);
        }
        assert.ok(store.reads.every((key) => key.startsWith('demo-ab12/b3/site/') || key === 'demo-ab12/current.json'), store.reads.join(', '));
    } finally {
        await app.close();
    }
});

test('an app with no pointer is "not published", and says so with the strict headers', async () => {
    const objects = build();
    delete objects['demo-ab12/current.json'];
    const app = await serve(fakeStore(objects));
    try {
        const res = await app.get('/');

        assert.strictEqual(res.status, 404);
        assert.match(await res.text(), /isn&#39;t published/);
        assert.strictEqual(res.headers.get('cache-control'), 'no-store');
        assert.match(res.headers.get('content-security-policy'), /frame-ancestors/);
    } finally {
        await app.close();
    }
});

test('a pointer that is not one workspace-service wrote is treated as not published', async () => {
    const app = await serve(fakeStore(build({ 'demo-ab12/current.json': '{"prefix":"../other-app/b1/site/"}' })));
    try {
        assert.strictEqual((await app.get('/')).status, 404);
    } finally {
        await app.close();
    }
});

test('storage being down is a 503 with Retry-After, never "not published"', async () => {
    const objects = build();
    objects.__down = true;
    const app = await serve(fakeStore(objects));
    try {
        const res = await app.get('/');

        assert.strictEqual(res.status, 503);
        assert.strictEqual(res.headers.get('retry-after'), '5');
        assert.doesNotMatch(await res.text(), /published/);
    } finally {
        await app.close();
    }
});

test('a storage error that is not a 404 is a 503 too', async () => {
    const objects = build();
    objects.__status = 500;
    const app = await serve(fakeStore(objects));
    try {
        assert.strictEqual((await app.get('/')).status, 503);
    } finally {
        await app.close();
    }
});

test('the pointer is remembered for a few seconds and read again after', async () => {
    const store = fakeStore(build());
    const app = await serve(store);
    try {
        await app.get('/');
        await app.get('/assets/app.css');
        assert.strictEqual(store.reads.filter((key) => key.endsWith('current.json')).length, 1);

        app.advance(6_000);
        await app.get('/');
        assert.strictEqual(store.reads.filter((key) => key.endsWith('current.json')).length, 2);
    } finally {
        await app.close();
    }
});

test('an update is picked up when the old build has been retired: the pointer is read again once', async () => {
    const objects = build();
    const store = fakeStore(objects);
    const app = await serve(store);
    try {
        await app.get('/');
        app.advance(2_000);
        objects['demo-ab12/current.json'] = '{"prefix":"b4/site/"}';
        objects['demo-ab12/b4/site/index.html'] = '<html><body>new</body></html>';
        for (const key of Object.keys(objects)) if (key.startsWith('demo-ab12/b3/')) delete objects[key];

        const res = await app.get('/');

        assert.strictEqual(res.status, 200);
        assert.match(await res.text(), /new/);
    } finally {
        await app.close();
    }
});

test('taking an app down is seen within the length of the pointer cache', async () => {
    const objects = build();
    const app = await serve(fakeStore(objects));
    try {
        assert.strictEqual((await app.get('/')).status, 200);
        delete objects['demo-ab12/current.json'];
        app.advance(6_000);

        assert.strictEqual((await app.get('/')).status, 404);
    } finally {
        await app.close();
    }
});

test('only GET and HEAD are served; anything else is 405 and never reaches storage', async () => {
    const store = fakeStore(build());
    const app = await serve(store);
    try {
        const res = await app.get('/', { method: 'POST', body: 'x' });

        assert.strictEqual(res.status, 405);
        assert.strictEqual(res.headers.get('allow'), 'GET, HEAD');
        assert.strictEqual(store.reads.length, 0);

        const head = await app.get('/', { method: 'HEAD' });
        assert.strictEqual(head.status, 200);
        assert.strictEqual(await head.text(), '');
    } finally {
        await app.close();
    }
});

test('a request that cannot be a path of the app is a 400 and never reaches storage', async () => {
    const store = fakeStore(build());
    const app = await serve(store);
    try {
        const res = await app.get('/%E0%A4%A');

        assert.strictEqual(res.status, 400);
        assert.strictEqual(store.reads.length, 0);
    } finally {
        await app.close();
    }
});

test('a page larger than the limit is streamed without the mark rather than held in memory', async () => {
    const huge = '<html><body>' + 'x'.repeat(5 * 1024 * 1024 + 10) + '</body></html>';
    const app = await serve(fakeStore(build({ 'demo-ab12/b3/site/index.html': huge })));
    try {
        const res = await app.get('/');

        assert.strictEqual(res.status, 200);
        assert.doesNotMatch((await res.text()).slice(-200), /Built with Singularity/);
    } finally {
        await app.close();
    }
});
