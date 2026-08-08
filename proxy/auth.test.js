/**
 * Covers proxy/auth.js: CODE_REVIEW.md SEC-06's access-token check. Uses Node's built-in test runner (`node --test`)
 * rather than adding a framework dependency this package has never needed before.
 *
 * A hardcoded token is checked against the same known-good HMAC-SHA256 value PreviewAccessTokenTest.java's
 * matchesTheNodeProxysIndependentlyComputedHmac asserts, so a change to either side's algorithm that breaks the
 * contract fails a test on both sides of the language boundary, not just one.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyToken, readCookie, accessCookieHeader, ACCESS_COOKIE_NAME } = require('./auth');

const SECRET = 'test-preview-token-secret';
const HOSTNAME = 'p7-ab3x9k2m7q.localhost';
// Mint(SECRET, HOSTNAME, 2026-01-01T00:00:00Z, 6h) from PreviewAccessTokenTest.java - see that file's comment.
const KNOWN_GOOD_TOKEN = '1767247200.51c962bf3bc39653a8f98ec0f340da4d4e4e2aa5cf08dd944da811edeb30e11c';

function mint(secret, hostname, expiresAtEpochSeconds) {
    const crypto = require('crypto');
    const signature = crypto.createHmac('sha256', secret).update(`${hostname}.${expiresAtEpochSeconds}`).digest('hex');
    return `${expiresAtEpochSeconds}.${signature}`;
}

test('a token matching the Java side\'s known-good value verifies, before it expires', () => {
    const oneMinuteBeforeItsOwnExpiry = 1767247200 - 60;

    assert.equal(verifyToken(SECRET, HOSTNAME, KNOWN_GOOD_TOKEN, oneMinuteBeforeItsOwnExpiry), true);
});

test('that same known-good value is rejected once its own expiry has passed', () => {
    const oneSecondAfterItsOwnExpiry = 1767247200 + 1;

    assert.equal(verifyToken(SECRET, HOSTNAME, KNOWN_GOOD_TOKEN, oneSecondAfterItsOwnExpiry), false);
});

test('verifyToken accepts a freshly minted, unexpired token', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = mint(SECRET, HOSTNAME, expiresAt);

    assert.equal(verifyToken(SECRET, HOSTNAME, token), true);
});

test('verifyToken rejects an expired token', () => {
    const expiresAt = Math.floor(Date.now() / 1000) - 1;
    const token = mint(SECRET, HOSTNAME, expiresAt);

    assert.equal(verifyToken(SECRET, HOSTNAME, token), false);
});

test('verifyToken rejects a token minted for a different hostname', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = mint(SECRET, HOSTNAME, expiresAt);

    assert.equal(verifyToken(SECRET, 'someone-elses-preview.localhost', token), false);
});

test('verifyToken rejects a token signed with the wrong secret', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = mint('wrong-secret', HOSTNAME, expiresAt);

    assert.equal(verifyToken(SECRET, HOSTNAME, token), false);
});

test('verifyToken fails closed when no secret is configured, rather than serving unauthenticated', () => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const token = mint(SECRET, HOSTNAME, expiresAt);

    assert.equal(verifyToken(undefined, HOSTNAME, token), false);
    assert.equal(verifyToken('', HOSTNAME, token), false);
});

test('verifyToken rejects malformed and missing tokens rather than throwing', () => {
    assert.equal(verifyToken(SECRET, HOSTNAME, null), false);
    assert.equal(verifyToken(SECRET, HOSTNAME, ''), false);
    assert.equal(verifyToken(SECRET, HOSTNAME, 'not-a-token'), false);
    assert.equal(verifyToken(SECRET, HOSTNAME, 'notanumber.abc123'), false);
});

test('readCookie finds the named cookie among several, and is not fooled by another one\'s value', () => {
    const header = `other=1; ${ACCESS_COOKIE_NAME}=abc.def; another=2`;

    assert.equal(readCookie(header, ACCESS_COOKIE_NAME), 'abc.def');
});

test('readCookie returns null when the cookie is absent or the header is missing', () => {
    assert.equal(readCookie('other=1', ACCESS_COOKIE_NAME), null);
    assert.equal(readCookie(null, ACCESS_COOKIE_NAME), null);
    assert.equal(readCookie(undefined, ACCESS_COOKIE_NAME), null);
});

test('accessCookieHeader is HttpOnly, Secure and SameSite=None - required for a cross-site iframe embed', () => {
    const header = accessCookieHeader('abc.def');

    assert.match(header, /HttpOnly/);
    assert.match(header, /Secure/);
    assert.match(header, /SameSite=None/);
    assert.match(header, new RegExp(`^${ACCESS_COOKIE_NAME}=abc\\.def;`));
});
