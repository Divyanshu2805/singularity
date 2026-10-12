/**
 * Covers proxy/snapshot.js: the function a previewed page uses to draw a small picture of itself, run here against
 * a stand-in window.
 *
 * Handles: a page that is copied, styled from the stylesheets that can be read, drawn and handed back as a data URL;
 * a stylesheet that cannot be read being skipped; scripts and frames being taken out of the copy; a typed value
 * being carried into the copy and a password never; a result too large to post being refused; and each way of
 * failing - no page, a copy that throws, a picture the browser will not draw or read back, and one that never
 * finishes - ending in one answer with a reason and never an exception.
 *
 * What a real browser makes of the SVG is not something a stand-in can show; that was looked at in a browser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { takeSnapshot } = require('./snapshot');

function element(tag, extra = {}) {
    return {
        tagName: tag.toUpperCase(), attributes: {}, children: [], parentNode: null, textContent: '',
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; },
        getAttribute(name) { return this.attributes[name] ?? null; },
        appendChild(child) { child.parentNode = this; this.children.push(child); },
        insertBefore(child) { child.parentNode = this; this.children.unshift(child); },
        ...extra,
    };
}

function standIn({ hasBody = true, canvasResult = 'data:image/webp;base64,AAAA', imageLoads = true, cloneThrows = false,
                   fields = [], removable = [] } = {}) {
    const timers = [];
    const drawn = { svg: null, calls: 0 };
    const head = element('head');
    const copyFields = fields.map((f) => element(f.tagName));
    const removed = [];
    const parentOfRemovable = { removeChild(child) { removed.push(child.tagName); } };
    const copy = element('html', {
        querySelector: (selector) => (selector === 'head' ? head : null),
        querySelectorAll: (selector) => {
            if (selector.indexOf('script,') === 0) return removable.map((tag) => element(tag, { parentNode: parentOfRemovable }));
            if (selector === 'input,textarea,select') return copyFields;
            return [];
        },
    });
    const root = {
        clientWidth: 1000,
        cloneNode: () => { if (cloneThrows) throw new Error('nope'); return copy; },
        querySelectorAll: (selector) => (selector === 'input,textarea,select' ? fields : []),
    };
    const document = {
        documentElement: root,
        body: hasBody ? {} : null,
        styleSheets: [
            { cssRules: [{ type: 1, cssText: 'body { color: red; }' }, { type: 3, cssText: '@import url(x.css);' }] },
            { get cssRules() { throw new Error('cross-origin'); } },
        ],
        createElement: (tag) => (tag === 'canvas'
            ? {
                getContext: () => ({ fillRect() {}, drawImage() { drawn.calls += 1; } }),
                toDataURL: () => (typeof canvasResult === 'function' ? canvasResult() : canvasResult),
            }
            : element(tag)),
    };
    const win = {
        document, innerWidth: 1000,
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: () => {},
        XMLSerializer: class { serializeToString() { return '<html xmlns="http://www.w3.org/1999/xhtml"></html>'; } },
        Image: class {
            set src(value) {
                drawn.svg = decodeURIComponent(value);
                if (imageLoads === true) this.onload();
                else if (imageLoads === false) this.onerror();
            }
        },
    };
    return { win, head, copyFields, removed, drawn, timers };
}

function snap(win) {
    const answers = [];
    takeSnapshot(win, (dataUrl, reason) => answers.push({ dataUrl, reason }));
    return answers;
}

test('a page is copied, styled from the sheets that can be read, drawn, and handed back as a data URL', () => {
    const page = standIn();
    const answers = snap(page.win);

    assert.deepEqual(answers, [{ dataUrl: 'data:image/webp;base64,AAAA', reason: null }]);
    assert.equal(page.head.children.length, 1);
    assert.equal(page.head.children[0].textContent, 'body { color: red; }\n');
    assert.match(page.drawn.svg, /^data:image\/svg\+xml;charset=utf-8,<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1280" height="800">/);
    assert.match(page.drawn.svg, /<foreignObject x="0" y="0" width="1280" height="800"><html xmlns=/);
    assert.equal(page.drawn.calls, 1);
});

test('scripts, frames and media are taken out of the copy', () => {
    const page = standIn({ removable: ['script', 'iframe', 'video'] });
    snap(page.win);
    assert.deepEqual(page.removed, ['SCRIPT', 'IFRAME', 'VIDEO']);
});

test('what is typed in a field is carried into the copy, and a password never is', () => {
    const page = standIn({
        fields: [
            { tagName: 'INPUT', type: 'text', value: 'Asha' },
            { tagName: 'INPUT', type: 'password', value: 'secret' },
            { tagName: 'INPUT', type: 'checkbox', checked: true, value: 'on' },
            { tagName: 'TEXTAREA', value: 'hello there' },
        ],
    });
    snap(page.win);
    assert.equal(page.copyFields[0].attributes.value, 'Asha');
    assert.equal(page.copyFields[1].attributes.value, '');
    assert.equal(page.copyFields[2].attributes.checked, 'checked');
    assert.equal(page.copyFields[3].textContent, 'hello there');
    assert.doesNotMatch(JSON.stringify(page.copyFields.map((f) => [f.attributes, f.textContent])), /secret/);
});

test('a picture too large to post is refused, after trying smaller ones', () => {
    let tries = 0;
    const page = standIn({ canvasResult: () => { tries += 1; return 'data:image/webp;base64,' + 'A'.repeat(300000); } });
    assert.deepEqual(snap(page.win), [{ dataUrl: null, reason: 'too large' }]);
    assert.equal(tries, 3);
});

test('a browser that gives back neither WebP nor JPEG has no picture', () => {
    const page = standIn({ canvasResult: 'data:image/png;base64,AAAA' });
    assert.deepEqual(snap(page.win), [{ dataUrl: null, reason: 'too large' }]);
});

test('each way of failing ends in one answer with a reason', () => {
    assert.deepEqual(snap(standIn({ hasBody: false }).win), [{ dataUrl: null, reason: 'no page' }]);
    assert.deepEqual(snap(standIn({ cloneThrows: true }).win), [{ dataUrl: null, reason: 'could not copy the page' }]);
    assert.deepEqual(snap(standIn({ imageLoads: false }).win), [{ dataUrl: null, reason: 'could not draw the page' }]);
    assert.deepEqual(snap(standIn({ canvasResult: () => { throw new Error('tainted'); } }).win),
        [{ dataUrl: null, reason: 'could not read the picture back' }]);
});

test('a picture that never finishes is given up on, once', () => {
    const page = standIn({ imageLoads: 'never' });
    const answers = snap(page.win);
    assert.deepEqual(answers, []);
    page.timers.forEach((fire) => fire());
    page.timers.forEach((fire) => fire());
    assert.deepEqual(answers, [{ dataUrl: null, reason: 'timed out' }]);
});

test('it is written for any browser: no arrow functions, let, const or template strings', () => {
    const source = takeSnapshot.toString();
    assert.doesNotMatch(source, /=>|\blet\s|\bconst\s|`/);
});
