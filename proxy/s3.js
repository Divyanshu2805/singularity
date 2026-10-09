/**
 * A minimal read-only S3 client for the preview proxy: signed GET and HEAD of one object, nothing else.
 *
 * Handles: AWS Signature Version 4 for a request with no body (path-style addressing, which MinIO uses), and streaming
 * the response back with its status and headers so a large file is piped to the visitor rather than held in memory.
 *
 * Written out rather than taken from an SDK because the proxy needs exactly one call and its image has two
 * dependencies; an SDK would be most of the image. The signing is checked against the worked example in AWS's own
 * documentation (s3.test.js), and against a real MinIO by the publishing pipeline test. It never signs a body and never
 * writes: the user it is given is read-only on the published-apps bucket, and that is the real guarantee.
 */
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const EMPTY_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function hmac(key, data) {
    return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
    return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/** RFC 3986 encoding of one path segment, as SigV4 wants it (everything but unreserved characters). */
function encodeSegment(segment) {
    return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function encodePath(path) {
    return path.split('/').map(encodeSegment).join('/');
}

function amzDate(date) {
    return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

/**
 * The Authorization header for a body-less request. `extraHeaders` are signed along with host, x-amz-content-sha256 and
 * x-amz-date (the AWS example signs a Range header), lower-cased by name.
 */
function sign({ method, host, path, extraHeaders = {}, date, accessKey, secretKey, region = 'us-east-1', service = 's3' }) {
    const stamp = amzDate(date);
    const day = stamp.slice(0, 8);
    const headers = { host, 'x-amz-content-sha256': EMPTY_SHA256, 'x-amz-date': stamp };
    for (const [name, value] of Object.entries(extraHeaders)) headers[name.toLowerCase()] = String(value).trim();

    const names = Object.keys(headers).sort();
    const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('');
    const signedHeaders = names.join(';');
    const canonicalRequest = [method, encodePath(path), '', canonicalHeaders, signedHeaders, EMPTY_SHA256].join('\n');

    const scope = `${day}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', stamp, scope, sha256Hex(canonicalRequest)].join('\n');
    const signingKey = hmac(hmac(hmac(hmac('AWS4' + secretKey, day), region), service), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');

    return {
        amzDate: stamp,
        signature,
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    };
}

/**
 * A client for one endpoint and one set of read credentials. `get` resolves with { status, headers, stream } for any
 * response the server gives (a 404 is a result, not an error); it rejects only when the server cannot be reached or
 * does not answer in time.
 */
function createS3Client({ endpoint, accessKey, secretKey, region = 'us-east-1', timeoutMs = 10_000 }) {
    const base = new URL(endpoint);
    const transport = base.protocol === 'https:' ? https : http;

    function request(method, bucket, key, { range, ifNoneMatch } = {}) {
        const path = `/${bucket}/${key}`;
        const signed = sign({ method, host: base.host, path, date: new Date(), accessKey, secretKey, region });
        const headers = {
            host: base.host,
            'x-amz-content-sha256': EMPTY_SHA256,
            'x-amz-date': signed.amzDate,
            authorization: signed.authorization,
        };
        if (range) headers.range = range;
        if (ifNoneMatch) headers['if-none-match'] = ifNoneMatch;

        return new Promise((resolve, reject) => {
            const req = transport.request({
                protocol: base.protocol,
                hostname: base.hostname,
                port: base.port || (base.protocol === 'https:' ? 443 : 80),
                method,
                path: encodePath(path),
                headers,
                timeout: timeoutMs,
            }, (res) => resolve({ status: res.statusCode, headers: res.headers, stream: res }));
            req.on('timeout', () => req.destroy(new Error('Storage did not answer in time')));
            req.on('error', reject);
            req.end();
        });
    }

    return {
        get: (bucket, key, options) => request('GET', bucket, key, options),
        head: (bucket, key, options) => request('HEAD', bucket, key, options),
    };
}

module.exports = { createS3Client, sign, encodePath, EMPTY_SHA256 };
