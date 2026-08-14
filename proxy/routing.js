/**
 * Turns a route lookup's outcome into the page index.js shows a visitor (CODE_REVIEW.md PRE-08), pulled out of
 * index.js so it can be tested without a real server or Redis.
 *
 * Handles: telling apart "no preview has ever registered this hostname" from "Redis itself didn't answer" - the two
 * looked identical before (both a bare null from a try/catch), which told a visitor "this preview isn't running"
 * during a Redis outage that has nothing to do with whether their preview is running at all. ROUTER_UNAVAILABLE is a
 * distinct sentinel index.js's getTarget returns instead of null so this function can tell them apart.
 */
const ROUTER_UNAVAILABLE = Symbol('router-unavailable');

function classifyMissingRoute(target) {
    if (target === ROUTER_UNAVAILABLE) {
        return {
            status: 503,
            title: 'Preview routing is temporarily unavailable',
            message: "This isn't about your preview - the routing service had trouble answering. Reloading in a moment usually fixes it.",
            refreshSeconds: 5,
        };
    }
    return {
        status: 404,
        title: "This preview isn't running",
        message: 'Open the project in VibeCraft and switch to Preview to start it.',
    };
}

module.exports = { ROUTER_UNAVAILABLE, classifyMissingRoute };
