/**
 * Covers proxy/s3.js: the Signature Version 4 signing every published-app read depends on. The worked GET Object example
 * from AWS's own documentation is pinned: if the signer drifts from the specification, every storage read starts failing
 * with 403 and no published app opens.
 */
const test = require('node:test');
const assert = require('node:assert');
const { sign, encodePath } = require('./s3');

test('signs the GET Object example from the AWS documentation exactly', () => {
    const result = sign({
        method: 'GET',
        host: 'examplebucket.s3.amazonaws.com',
        path: '/test.txt',
        extraHeaders: { range: 'bytes=0-9' },
        date: new Date('2013-05-24T00:00:00Z'),
        accessKey: 'AKIAIOSFODNN7EXAMPLE',
        secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        region: 'us-east-1',
    });

    assert.strictEqual(result.signature, 'f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
    assert.strictEqual(result.amzDate, '20130524T000000Z');
    assert.match(result.authorization, /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/20130524\/us-east-1\/s3\/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8/);
});

test('a path is encoded segment by segment, keeping its slashes', () => {
    assert.strictEqual(encodePath('/published-apps/my-app/b1/site/a b/c(1).js'), '/published-apps/my-app/b1/site/a%20b/c%281%29.js');
});

test('the same request signed at different times gets a different signature', () => {
    const base = { method: 'GET', host: 'minio:9000', path: '/b/k', accessKey: 'a', secretKey: 'b' };
    const one = sign({ ...base, date: new Date('2026-10-08T10:00:00Z') });
    const two = sign({ ...base, date: new Date('2026-10-08T10:00:01Z') });

    assert.notStrictEqual(one.signature, two.signature);
});
