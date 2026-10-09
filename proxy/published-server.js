/**
 * Serves a published app from storage: the request handler the preview proxy hands a published app's hostname to.
 *
 * Handles: GET and HEAD only; reading the pointer that says which build is live (and remembering it for a few seconds,
 * so a busy app is not a storage read per file); mapping the request path to the files to try; the single-page
 * fallback; conditional requests and ranges passed through to storage; the "Built with Singularity" mark added to HTML;
 * the strict headers on every response; and a readable page for an app that is not published, a file that is missing and
 * storage that does not answer - told apart, so an outage is never shown as "this app isn't published".
 *
 * No token, no cookie, no session: a published app is public by design, and nothing here reads or sets a credential. It
 * never talks to Redis, a database or a service - storage is the source of truth, and removing the pointer there is what
 * takes an app down (at worst a few seconds later, the length of the pointer cache). The storage client is passed in,
 * so the tests drive this with a fake store.
 *
 * A pointer that no longer leads anywhere - the build was retired between the pointer being cached and the file being
 * asked for - is dropped and read again once, instead of showing a 404 for a few seconds around every update.
 */
const {
    MAX_HTML_BYTES, candidatesFor, contentTypeFor, isHtmlKey, cacheControlFor, securityHeaders,
    parsePointer, injectBadge, pageHtml, pathSegments, PAGES,
} = require('./published');

const POINTER_TTL_MS = 5_000;
const MISSING_TTL_MS = 3_000;
const MAX_CACHED = 2_000;
const MIN_POINTER_AGE_FOR_REREAD_MS = 1_000;
const MAX_POINTER_BYTES = 4096;
const NOT_PUBLISHED = Symbol('not-published');
const UNAVAILABLE = Symbol('unavailable');

async function readBody(stream, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > limit) {
            stream.destroy();
            return null;
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function createPublishedHandler({ store, bucket, appUrl, frameAncestors, https = false, now = Date.now }) {
    const pointers = new Map();
    const baseHeaders = securityHeaders({ frameAncestors, https });

    function remember(slug, value, ttl) {
        if (pointers.size >= MAX_CACHED) pointers.clear();
        pointers.set(slug, { value, expires: now() + ttl, at: now() });
    }

    async function pointerFor(slug, fresh) {
        const cached = pointers.get(slug);
        if (!fresh && cached && cached.expires > now()) return cached.value;
        let response;
        try {
            response = await store.get(bucket, `${slug}/current.json`);
        } catch (err) {
            console.error('Published: storage unreachable for %s: %s', slug, err.message);
            return UNAVAILABLE;
        }
        if (response.status === 404 || response.status === 403) {
            response.stream.resume();
            remember(slug, NOT_PUBLISHED, MISSING_TTL_MS);
            return NOT_PUBLISHED;
        }
        if (response.status !== 200) {
            response.stream.resume();
            return UNAVAILABLE;
        }
        const body = await readBody(response.stream, MAX_POINTER_BYTES);
        const pointer = body && parsePointer(body);
        if (!pointer) {
            remember(slug, NOT_PUBLISHED, MISSING_TTL_MS);
            return NOT_PUBLISHED;
        }
        remember(slug, pointer, POINTER_TTL_MS);
        return pointer;
    }

    function page(res, req, spec, extra = {}) {
        if (res.headersSent) return res.end();
        const body = pageHtml(spec.title, spec.message);
        res.writeHead(spec.status, {
            ...baseHeaders,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Length': Buffer.byteLength(body),
            ...extra,
        });
        res.end(req.method === 'HEAD' ? undefined : body);
    }

    async function fetchFirst(slug, pointer, candidates, req) {
        let sawUnavailable = false;
        for (const candidate of candidates) {
            let response;
            try {
                response = await store.get(bucket, `${slug}/${pointer.prefix}${candidate.key}`, {
                    range: req.headers.range,
                    ifNoneMatch: isHtmlKey(candidate.key) ? undefined : req.headers['if-none-match'],
                });
            } catch (err) {
                console.error('Published: storage unreachable for %s: %s', slug, err.message);
                return { unavailable: true };
            }
            if (response.status === 200 || response.status === 206 || response.status === 304) {
                return { response, candidate };
            }
            response.stream.resume();
            if (response.status !== 404 && response.status !== 403) sawUnavailable = true;
        }
        return sawUnavailable ? { unavailable: true } : { missing: true };
    }

    return async function handle(req, res, slug) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return page(res, req, { status: 405, title: 'Method not allowed', message: 'Published apps can only be read.' }, { Allow: 'GET, HEAD' });
        }
        const parsed = pathSegments(req.url);
        if (!parsed) return page(res, req, PAGES.badRequest);
        const candidates = candidatesFor(parsed);

        let pointer = await pointerFor(slug, false);
        if (pointer === UNAVAILABLE) return page(res, req, PAGES.unavailable, { 'Retry-After': '5' });
        if (pointer === NOT_PUBLISHED) return page(res, req, PAGES.notPublished);

        const pointerAge = now() - (pointers.get(slug)?.at ?? 0);
        let found = await fetchFirst(slug, pointer, candidates, req);
        if (found.missing && pointerAge > MIN_POINTER_AGE_FOR_REREAD_MS) {
            const fresh = await pointerFor(slug, true);
            if (fresh === NOT_PUBLISHED) return page(res, req, PAGES.notPublished);
            if (fresh !== UNAVAILABLE && fresh.prefix !== pointer.prefix) {
                pointer = fresh;
                found = await fetchFirst(slug, pointer, candidates, req);
            }
        }
        if (found.unavailable) return page(res, req, PAGES.unavailable, { 'Retry-After': '5' });
        if (found.missing) return page(res, req, PAGES.notFound);

        return send(req, res, found.response, found.candidate.key);
    };

    async function send(req, res, response, key) {
        const headers = { ...baseHeaders, 'Content-Type': contentTypeFor(key), 'Cache-Control': cacheControlFor(key) };
        const html = isHtmlKey(key);

        if (response.status === 304) {
            response.stream.resume();
            if (response.headers.etag) headers.ETag = response.headers.etag;
            res.writeHead(304, headers);
            return res.end();
        }

        const size = Number(response.headers['content-length']);
        if (html && response.status === 200 && Number.isFinite(size) && size <= MAX_HTML_BYTES) {
            const body = await readBody(response.stream, MAX_HTML_BYTES);
            if (body) {
                const marked = Buffer.from(injectBadge(body.toString('utf8'), appUrl), 'utf8');
                headers['Cache-Control'] = 'no-cache';
                headers['Content-Length'] = marked.length;
                res.writeHead(200, headers);
                return res.end(req.method === 'HEAD' ? undefined : marked);
            }
            return page(res, req, PAGES.unavailable);
        }

        if (response.headers.etag) headers.ETag = response.headers.etag;
        if (response.headers['content-length']) headers['Content-Length'] = response.headers['content-length'];
        if (response.headers['accept-ranges']) headers['Accept-Ranges'] = response.headers['accept-ranges'];
        if (response.headers['content-range']) headers['Content-Range'] = response.headers['content-range'];
        res.writeHead(response.status, headers);
        if (req.method === 'HEAD') {
            response.stream.resume();
            return res.end();
        }
        response.stream.on('error', () => res.destroy());
        response.stream.pipe(res);
    }
}

module.exports = { createPublishedHandler };
