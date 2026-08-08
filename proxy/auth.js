/**
 * The preview proxy's access-token check (CODE_REVIEW.md SEC-06), pulled out of index.js so it can be tested
 * without starting the real server or connecting to Redis.
 *
 * Handles: verifying the signed, expiring token workspace-service's PreviewAccessToken.java mints, reading it back
 * off a cookie, and building the Set-Cookie header that exchanges a valid one-time URL token for it. Every function
 * here is pure - no Redis, no server, no process-global state beyond the secret it's given - so index.js's own tests
 * can hand it a known secret and known inputs instead of depending on the real environment.
 *
 * This re-implements PreviewAccessToken.java's exact scheme: `hostname + "." + expiresAt`, signed with HMAC-SHA256,
 * hex-encoded. The two must stay byte-for-byte identical - PreviewAccessTokenTest's
 * matchesTheNodeProxysIndependentlyComputedHmac case is the contract test that catches drift on the Java side; this
 * file's own tests catch it here.
 */
const crypto = require('crypto');

const ACCESS_COOKIE_NAME = 'pv_auth';
const TOKEN_QUERY_PARAM = 'pvt';

function verifyToken(secret, hostname, token, nowEpochSeconds = Math.floor(Date.now() / 1000)) {
    if (!secret) return false;
    if (!token || typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot < 0) return false;
    const expiresAt = Number(token.slice(0, dot));
    if (!Number.isFinite(expiresAt) || nowEpochSeconds > expiresAt) return false;

    const expected = crypto.createHmac('sha256', secret).update(`${hostname}.${expiresAt}`).digest('hex');
    const provided = token.slice(dot + 1);
    if (expected.length !== provided.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

function readCookie(cookieHeader, name) {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const eq = part.indexOf('=');
        if (eq < 0) continue;
        if (part.slice(0, eq).trim() === name) {
            try {
                return decodeURIComponent(part.slice(eq + 1).trim());
            } catch {
                return null;
            }
        }
    }
    return null;
}

function accessCookieHeader(token) {
    return `${ACCESS_COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/`;
}

module.exports = { verifyToken, readCookie, accessCookieHeader, ACCESS_COOKIE_NAME, TOKEN_QUERY_PARAM };
