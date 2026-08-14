/**
 * Covers proxy/routing.js: CODE_REVIEW.md PRE-08's requirement that a Redis outage and a route that genuinely
 * doesn't exist show a visitor two different things.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { ROUTER_UNAVAILABLE, classifyMissingRoute } = require('./routing');

test('a missing route is reported as the preview not running, not a server problem', () => {
    const page = classifyMissingRoute(null);

    assert.equal(page.status, 404);
    assert.match(page.title, /isn't running/);
});

test('a Redis failure is reported as a routing problem, distinct from the preview never having started', () => {
    const page = classifyMissingRoute(ROUTER_UNAVAILABLE);

    assert.equal(page.status, 503);
    assert.doesNotMatch(page.title, /isn't running/);
    assert.ok(page.refreshSeconds > 0, 'should offer to retry rather than dead-end the visitor');
});
