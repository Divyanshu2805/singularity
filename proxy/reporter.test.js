/**
 * Covers proxy/reporter.js: the script injected into a previewed page, run here against a stand-in window, and the
 * status pages.
 *
 * Handles: where the script is injected; that it stays silent in a tab of its own; the ready message with the
 * page's address; errors reported once each; the compile-error overlay being reported and then reported gone, so the
 * same error can be reported again; console lines relayed in batches, shortened, capped, and still reaching the real
 * console; a blank page noticed, and the notice taken back when the app renders late; back, forward, reload and
 * go-to-address carried out only for the parent window, only when there is somewhere to go, and never to another
 * origin; and a status page escaping what it is given and telling the tab its status.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { REPORTER, REPORTER_SOURCE, injectReporter, statusPageHtml } = require('./reporter');

function page({ framed = true, navigation, bodyText = 'Hello', drawn = false } = {}) {
    const posted = [];
    const listeners = {};
    const timers = [];
    const realConsole = [];
    const parent = { postMessage: (message) => posted.push(JSON.parse(JSON.stringify(message))) };
    const body = { innerText: bodyText, querySelector: () => (drawn ? {} : null) };
    const location = {
        origin: 'http://p1-abc.localhost:8090', pathname: '/', search: '', hash: '',
        assigned: null, reloaded: 0,
        assign(path) { this.assigned = path; },
        reload() { this.reloaded += 1; },
    };
    const history = {
        went: [],
        pushState(state, title, url) { location.pathname = url; },
        replaceState(state, title, url) { location.pathname = url; },
        back() { this.went.push('back'); },
        forward() { this.went.push('forward'); },
    };
    let observer = null;
    const window = {
        location, history, navigation,
        addEventListener: (type, handler) => { (listeners[type] = listeners[type] || []).push(handler); },
    };
    window.parent = framed ? parent : window;
    const context = {
        window, history, URL,
        document: { body, documentElement: {} },
        console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(
            (level) => [level, (...args) => realConsole.push([level, ...args])])),
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        MutationObserver: class {
            constructor(callback) { observer = callback; }
            observe() {}
        },
    };
    vm.runInNewContext(REPORTER_SOURCE, context);
    return {
        posted, parent, body, location, history, realConsole, console: context.console,
        of: (type) => posted.filter((message) => message.type === type),
        fire: (type, event) => (listeners[type] || []).forEach((handler) => handler(event)),
        mutate: (added = [], removed = []) => observer([{ addedNodes: added, removedNodes: removed }]),
        runTimers: () => { while (timers.length) timers.shift()(); },
    };
}

const overlay = (message) => ({
    tagName: 'VITE-ERROR-OVERLAY',
    shadowRoot: { querySelector: (sel) => (sel === '.message' ? { textContent: message } : null) },
});

test('the reporter goes in right after the opening head tag, or first when there is none', () => {
    assert.equal(injectReporter('<html><head lang="en"><title>x</title></head></html>'),
        `<html><head lang="en">${REPORTER}<title>x</title></head></html>`);
    assert.equal(injectReporter('<p>bare</p>'), `${REPORTER}<p>bare</p>`);
});

test('a preview opened in a tab of its own reports to nobody', () => {
    const p = page({ framed: false });

    p.fire('error', { message: 'boom' });
    p.console.log('hello');
    p.runTimers();

    assert.deepEqual(p.posted, []);
    assert.deepEqual(p.realConsole, [['log', 'hello']]);
});

test('the first thing a framed page says is that it is up, and where', () => {
    const p = page();

    assert.equal(p.posted[0].type, 'PreviewReady');
    assert.deepEqual(p.posted[0].payload, { path: '/', canGoBack: false, canGoForward: false });
});

test('an error is reported once, however often it is thrown', () => {
    const p = page();

    p.fire('error', { message: 'x is not defined', filename: '/src/App.tsx', lineno: 4, colno: 2 });
    p.fire('error', { message: 'x is not defined', filename: '/src/App.tsx', lineno: 4, colno: 2 });
    p.fire('unhandledrejection', { reason: new Error('fetch failed') });

    const errors = p.of('PreviewError');
    assert.equal(errors.length, 2);
    assert.equal(errors[0].subType, 'Runtime error');
    assert.equal(errors[0].payload.source, '/src/App.tsx');
    assert.equal(errors[1].subType, 'Unhandled promise rejection');
    assert.equal(errors[1].payload.message, 'fetch failed');
});

test('the compile-error overlay is reported, then reported gone, and the same error can be reported again', () => {
    const p = page();
    const node = overlay('Unexpected token (3:1)');

    p.mutate([node]);
    p.mutate([], [node]);
    p.mutate([node]);

    assert.equal(p.of('PreviewError').length, 2);
    assert.equal(p.of('PreviewError')[0].subType, 'Build error');
    assert.deepEqual(p.of('PreviewErrorCleared').map((m) => m.subType), ['Build error']);
});

test('console lines reach the tab in one batch and still reach the real console', () => {
    const p = page();

    p.console.log('loaded', { items: 3 });
    p.console.warn('careful');
    p.console.error(new Error('nope'));
    assert.equal(p.of('PreviewConsole').length, 0);
    p.runTimers();

    const [batch] = p.of('PreviewConsole');
    assert.deepEqual(batch.payload.lines.slice(0, 2), [
        { level: 'log', text: 'loaded {"items":3}' },
        { level: 'warn', text: 'careful' },
    ]);
    assert.equal(batch.payload.lines[2].level, 'error');
    assert.match(batch.payload.lines[2].text, /nope/);
    assert.equal(p.realConsole.length, 3);
});

test('a long argument is shortened, a circular one does not throw, and a flood is capped with a count', () => {
    const p = page();
    const circular = { name: 'loop' };
    circular.self = circular;

    p.console.log('x'.repeat(5000));
    p.console.log(circular);
    for (let i = 0; i < 100; i++) p.console.log(`line ${i}`);
    p.runTimers();

    const lines = p.of('PreviewConsole')[0].payload.lines;
    assert.equal(lines[0].text.length, 2003);
    assert.match(lines[1].text, /\[circular\]/);
    assert.equal(lines.length, 41);
    assert.equal(lines[40].text, '... 62 more lines not shown');
});

test('a page that loaded and drew nothing is reported blank, and the report is taken back when it renders', () => {
    const p = page({ bodyText: '  \n ' });

    p.fire('load', {});
    p.runTimers();
    assert.equal(p.of('PreviewBlank').length, 1);

    p.body.innerText = 'Now there is an app';
    p.mutate([{ tagName: 'DIV' }]);
    p.runTimers();
    assert.equal(p.of('PreviewRendered').length, 1);
});

test('a page with text, or with only something drawn, is not blank', () => {
    const withText = page({ bodyText: 'Hi' });
    withText.fire('load', {});
    withText.runTimers();

    const onlyACanvas = page({ bodyText: '', drawn: true });
    onlyACanvas.fire('load', {});
    onlyACanvas.runTimers();

    assert.equal(withText.of('PreviewBlank').length, 0);
    assert.equal(onlyACanvas.of('PreviewBlank').length, 0);
});

test('a page showing the compile-error overlay is a build error, not a blank page', () => {
    const p = page({ bodyText: '' });

    p.mutate([overlay('Unexpected token')]);
    p.fire('load', {});
    p.runTimers();

    assert.equal(p.of('PreviewBlank').length, 0);
});

test('the page says where it is and whether there is anywhere to go as it moves', () => {
    const p = page();

    p.history.pushState(null, '', '/about');
    p.history.pushState(null, '', '/contact');
    p.location.pathname = '/about';
    p.fire('popstate', {});

    const places = p.of('PreviewLocation').map((m) => m.payload);
    assert.deepEqual(places, [
        { path: '/about', canGoBack: true, canGoForward: false },
        { path: '/contact', canGoBack: true, canGoForward: false },
        { path: '/about', canGoBack: true, canGoForward: true },
    ]);
});

test('where the browser knows whether the frame can go back, its word is used', () => {
    const p = page({ navigation: { canGoBack: false, canGoForward: true } });

    p.history.pushState(null, '', '/about');

    assert.deepEqual(p.of('PreviewLocation')[0].payload, { path: '/about', canGoBack: false, canGoForward: true });
});

test('back and forward are carried out only when there is somewhere to go', () => {
    const p = page();
    const command = (name) => p.fire('message', { source: p.parent, data: { type: 'PreviewCommand', command: name } });

    command('back');
    command('forward');
    assert.deepEqual(p.history.went, []);

    p.history.pushState(null, '', '/about');
    command('back');
    p.fire('popstate', {});
    command('forward');

    assert.deepEqual(p.history.went, ['back', 'forward']);
});

test('commands are taken only from the parent window', () => {
    const p = page();
    p.history.pushState(null, '', '/about');

    p.fire('message', { source: {}, data: { type: 'PreviewCommand', command: 'back' } });
    p.fire('message', { source: {}, data: { type: 'PreviewCommand', command: 'reload' } });
    p.fire('message', { source: p.parent, data: { type: 'SomethingElse', command: 'reload' } });

    assert.deepEqual(p.history.went, []);
    assert.equal(p.location.reloaded, 0);
});

test('reload reloads, and an address is opened only on this same origin', () => {
    const p = page();
    const go = (path) => p.fire('message', { source: p.parent, data: { type: 'PreviewCommand', command: 'navigate', path } });

    p.fire('message', { source: p.parent, data: { type: 'PreviewCommand', command: 'reload' } });
    go('/settings?tab=2#top');
    assert.equal(p.location.reloaded, 1);
    assert.equal(p.location.assigned, '/settings?tab=2#top');

    p.location.assigned = null;
    go('https://evil.example/steal');
    go('//evil.example/steal');
    go('javascript:alert(1)');
    go(42);
    assert.equal(p.location.assigned, null);
});

test('a status page escapes what it is given and tells the tab its status', () => {
    const html = statusPageHtml(404, "This preview isn't <b>running</b>", 'Open the "project"', {});

    assert.match(html, /This preview isn&#39;t &lt;b&gt;running&lt;\/b&gt;/);
    assert.match(html, /Open the &quot;project&quot;/);
    assert.match(html, /type: 'PreviewStatusPage', payload: \{ status: 404 \}/);
    assert.doesNotMatch(html, /http-equiv="refresh"/);
});

test('a status page that will be retried says when', () => {
    assert.match(statusPageHtml(502, 'The preview is restarting', 'One moment', { refreshSeconds: 3 }),
        /<meta http-equiv="refresh" content="3">/);
});
